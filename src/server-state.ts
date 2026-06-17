import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, createReadStream } from "node:fs";
import { rm, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectRoot = process.cwd();

export const reportRoot = resolve(projectRoot, "reports");
const configPath = resolve(projectRoot, "a11y-crawler.config.json");
const crawlCommand = process.env.CRAWL_COMMAND ?? "yarn a11y:crawl";

type CrawlJob = {
  process?: ChildProcessWithoutNullStreams;
  runId?: string;
  running: boolean;
  stopping: boolean;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  logs: string[];
  stopTimers: NodeJS.Timeout[];
};

const globalState = globalThis as typeof globalThis & { __mobileA11yCrawlJob?: CrawlJob };

const crawlJob = globalState.__mobileA11yCrawlJob ?? {
  running: false,
  stopping: false,
  logs: [],
  stopTimers: [],
};
globalState.__mobileA11yCrawlJob = crawlJob;

export async function getConfig(): Promise<Record<string, any>> {
  return readConfig();
}

export async function getConfigOptions() {
  const config = await readConfig();
  const fallbackDeviceName = String(config.capabilities?.["appium:deviceName"] ?? "");
  const fallbackRuntime = String(config.capabilities?.["appium:platformVersion"] ?? "");

  try {
    const [devicesResult, runtimesResult] = await Promise.all([
      execFileAsync("xcrun", ["simctl", "list", "devices", "available", "--json"]),
      execFileAsync("xcrun", ["simctl", "list", "runtimes", "--json"]),
    ]);
    const devicesPayload = JSON.parse(devicesResult.stdout) as {
      devices?: Record<string, Array<{ name: string; udid: string; state: string }>>;
    };
    const runtimesPayload = JSON.parse(runtimesResult.stdout) as {
      runtimes?: Array<{ platform?: string; name?: string; version?: string; identifier?: string; isAvailable?: boolean }>;
    };

    const devices = Object.entries(devicesPayload.devices ?? {})
      .flatMap(([runtime, devices]) => devices.map((device) => ({ ...device, runtime })))
      .filter((device) => device.name && device.udid)
      .sort((a, b) => a.name.localeCompare(b.name));
    const runtimes = (runtimesPayload.runtimes ?? [])
      .filter((runtime) => runtime.platform === "iOS" && runtime.isAvailable !== false && runtime.version)
      .map((runtime) => ({
        name: runtime.name ?? `iOS ${runtime.version}`,
        version: String(runtime.version),
        identifier: runtime.identifier ?? "",
      }))
      .sort((a, b) => b.version.localeCompare(a.version));

    return { devices, runtimes };
  } catch (error) {
    return {
      devices: fallbackDeviceName ? [{ name: fallbackDeviceName, udid: "", state: "Unknown", runtime: fallbackRuntime }] : [],
      runtimes: fallbackRuntime ? [{ name: `iOS ${fallbackRuntime}`, version: fallbackRuntime, identifier: "" }] : [],
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function updateConfig(body: {
  deviceName?: string;
  platformVersion?: string;
  bundleId?: string;
  startExpo?: boolean;
  expoCwd?: string;
  expoCommand?: string;
}) {
  if (crawlJob.running) {
    return { status: 409, body: { error: "Cannot update config while a crawl is running." } };
  }

  if (!body.deviceName || !body.platformVersion || !body.bundleId || isPlaceholderBundleId(body.bundleId)) {
    return { status: 400, body: { error: "deviceName, platformVersion, and bundleId are required." } };
  }

  const config = await readConfig();
  config.platform = "ios";
  config.capabilities = {
    ...(config.capabilities ?? {}),
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": body.deviceName,
    "appium:platformVersion": body.platformVersion,
    "appium:bundleId": body.bundleId,
    "appium:noReset": true,
    "appium:autoAcceptAlerts": true,
    "appium:newCommandTimeout": 300,
    "appium:waitForIdleTimeout": 2,
    "appium:reduceMotion": true,
  };
  delete config.capabilities["appium:app"];
  config.bootstrap = {
    ...(config.bootstrap ?? {}),
    startAppium: true,
    appiumCommand: config.bootstrap?.appiumCommand ?? "yarn appium:server",
    startSimulator: true,
    simulatorName: body.deviceName,
    startExpo: Boolean(body.startExpo),
    expoCwd: body.expoCwd?.trim() || config.bootstrap?.expoCwd || "../your-expo-app",
    expoCommand: body.expoCommand?.trim() || config.bootstrap?.expoCommand || "yarn expo start --dev-client",
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { status: 200, body: config };
}

export async function listRuns() {
  try {
    const entries = await readdir(reportRoot, { withFileTypes: true });
    const runs = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const run = entry.name;
        const runPath = resolve(reportRoot, run);
        const reportPath = resolve(runPath, "report.json");
        const runStat = await stat(runPath);
        let summary: unknown;
        let generatedAt = runStat.mtime.toISOString();

        if (existsSync(reportPath)) {
          try {
            const report = JSON.parse(await readFile(reportPath, "utf8")) as {
              generatedAt?: string;
              summary?: unknown;
            };
            generatedAt = report.generatedAt ?? generatedAt;
            summary = report.summary;
          } catch {
            // Keep filesystem metadata fallback.
          }
        }

        return { id: run, generatedAt, summary };
      }));
    runs.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return { runs };
  } catch {
    return { runs: [] };
  }
}

export async function readRunReport(run: string) {
  const reportPath = safeRunPath(run, "report.json");
  if (!reportPath.startsWith(reportRoot) || !existsSync(reportPath)) {
    return undefined;
  }

  return JSON.parse(await readFile(reportPath, "utf8"));
}

export async function deleteRun(run: string) {
  if (crawlJob.running) {
    return { status: 409, body: { error: "Cannot delete reports while a crawl is running." } };
  }

  const runPath = safeRunPath(run);
  if (!runPath.startsWith(reportRoot) || !existsSync(runPath)) {
    return { status: 404, body: { error: "Run not found" } };
  }

  await rm(runPath, { recursive: true, force: true });
  return { status: 204, body: undefined };
}

export function getCrawlStatus() {
  return serializeJob();
}

export function startCrawl() {
  if (crawlJob.running) {
    return { status: 409, body: serializeJob() };
  }

  crawlJob.running = true;
  crawlJob.stopping = false;
  crawlJob.startedAt = new Date().toISOString();
  crawlJob.finishedAt = undefined;
  crawlJob.exitCode = undefined;
  crawlJob.error = undefined;
  crawlJob.logs = [];
  clearStopTimers();

  const runId = `run-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
  crawlJob.runId = runId;
  const runOutputDir = resolve(reportRoot, runId);
  const child = spawn(crawlCommand, {
    cwd: projectRoot,
    shell: true,
    env: {
      ...process.env,
      REPORT_OUTPUT_DIR: runOutputDir,
      REPORT_RUN_ID: runId,
    },
    detached: process.platform !== "win32",
  });
  crawlJob.process = child;
  appendLog(`$ ${crawlCommand}`);
  appendLog(`Report output: ${runOutputDir}`);

  child.stdout.on("data", (chunk) => appendLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(chunk.toString()));
  child.on("error", (error) => {
    crawlJob.error = error.message;
    appendLog(`Process error: ${error.message}`);
  });
  child.on("exit", (code) => {
    crawlJob.running = false;
    crawlJob.stopping = false;
    crawlJob.finishedAt = new Date().toISOString();
    crawlJob.exitCode = code;
    crawlJob.process = undefined;
    clearStopTimers();
    appendLog(`Process exited with code ${code}`);
  });

  return { status: 202, body: serializeJob() };
}

export function stopCrawl() {
  if (!crawlJob.running || !crawlJob.process) {
    return { status: 200, body: serializeJob() };
  }

  appendLog("Stop requested from web UI.");
  crawlJob.stopping = true;
  signalProcessTree(crawlJob.process, "SIGINT");
  crawlJob.stopTimers.push(setTimeout(() => {
    if (crawlJob.running && crawlJob.process) {
      appendLog("Crawler did not stop after SIGINT. Sending SIGTERM.");
      signalProcessTree(crawlJob.process, "SIGTERM");
    }
  }, 5_000));
  crawlJob.stopTimers.push(setTimeout(() => {
    if (crawlJob.running && crawlJob.process) {
      appendLog("Crawler did not stop after SIGTERM. Sending SIGKILL.");
      signalProcessTree(crawlJob.process, "SIGKILL");
    }
  }, 10_000));

  return { status: 200, body: serializeJob() };
}

export function getArtifactPath(run: string, artifactPath: string[]) {
  const artifact = resolve(reportRoot, run, ...artifactPath);
  if (!artifact.startsWith(resolve(reportRoot, run)) || !existsSync(artifact)) {
    return undefined;
  }

  return artifact;
}

export function streamArtifact(path: string) {
  return createReadStream(path);
}

export function contentTypeFor(path: string) {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function appendLog(message: string): void {
  for (const line of message.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    crawlJob.logs.push(line);
  }

  if (crawlJob.logs.length > 500) {
    crawlJob.logs.splice(0, crawlJob.logs.length - 500);
  }
}

function serializeJob() {
  return {
    running: crawlJob.running,
    stopping: crawlJob.stopping,
    startedAt: crawlJob.startedAt,
    finishedAt: crawlJob.finishedAt,
    exitCode: crawlJob.exitCode,
    error: crawlJob.error,
    runId: crawlJob.runId,
    logs: crawlJob.logs.slice(-200),
  };
}

function signalProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  try {
    if (process.platform === "win32") {
      child.kill(signal);
      return;
    }

    if (!child.pid) {
      child.kill(signal);
      return;
    }

    process.kill(-child.pid, signal);
  } catch (error) {
    appendLog(`Failed to send ${signal}: ${error instanceof Error ? error.message : String(error)}`);
    try {
      child.kill(signal);
    } catch {
      // The process may already be gone.
    }
  }
}

function clearStopTimers(): void {
  for (const timer of crawlJob.stopTimers) {
    clearTimeout(timer);
  }
  crawlJob.stopTimers = [];
}

function safeRunPath(run: string, childPath = ""): string {
  return resolve(reportRoot, run, childPath);
}

async function readConfig(): Promise<Record<string, any>> {
  if (existsSync(configPath)) {
    const content = await readFile(configPath, "utf8");
    return JSON.parse(content) as Record<string, any>;
  }

  const examplePath = resolve(/*turbopackIgnore: true*/ projectRoot, "a11y-crawler.config.example.json");
  if (existsSync(examplePath)) {
    const content = await readFile(examplePath, "utf8");
    return JSON.parse(content) as Record<string, any>;
  }

  return {
    platform: "ios",
    appiumServerUrl: "http://127.0.0.1:4723",
    capabilities: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:bundleId": "com.yourcompany.yourexpoapp",
      "appium:noReset": true,
      "appium:autoAcceptAlerts": true,
      "appium:newCommandTimeout": 300,
      "appium:waitForIdleTimeout": 2,
      "appium:reduceMotion": true,
    },
    bootstrap: {
      startAppium: true,
      appiumCommand: "yarn appium:server",
      startSimulator: true,
      startExpo: false,
      startupTimeoutMs: 90000,
    },
    crawl: {
      maxDepth: 5,
      maxScreens: 40,
      maxDurationMs: 600000,
      appReadyTimeoutMs: 120000,
      maxActionsPerScreen: 8,
      maxTapTargetsPerScreen: 24,
      tapTimeoutMs: 2500,
      settleMs: 900,
      includeTextsAsTapTargets: false,
      denyLabels: ["Delete", "Logout", "Sign out"],
      denyPatterns: ["delete", "logout", "sign out", "heading"],
      seedActions: [],
    },
    report: {
      outputDir: "reports/a11y-crawl",
    },
  };
}

function isPlaceholderBundleId(bundleId: string): boolean {
  return ["com.yourcompany.yourexpoapp", "com.example.app"].includes(bundleId.trim().toLowerCase());
}
