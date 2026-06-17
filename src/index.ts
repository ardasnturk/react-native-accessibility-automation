import { mkdir, writeFile } from "node:fs/promises";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { basename, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { remote, type Browser } from "webdriverio";

type Platform = "ios" | "android";

type SeedAction =
  | { type: "tap"; selector: string; required?: boolean }
  | { type: "pause"; ms: number };

type BootstrapConfig = {
  startAppium?: boolean;
  appiumCommand?: string;
  startSimulator?: boolean;
  simulatorName?: string;
  startExpo?: boolean;
  expoCommand?: string;
  expoCwd?: string;
  startupTimeoutMs?: number;
};

type Config = {
  platform: Platform;
  appiumServerUrl: string;
  capabilities: Record<string, unknown>;
  bootstrap?: BootstrapConfig;
  crawl?: {
    maxDepth?: number;
    maxScreens?: number;
    maxDurationMs?: number;
    appReadyTimeoutMs?: number;
    maxActionsPerScreen?: number;
    maxTapTargetsPerScreen?: number;
    tapTimeoutMs?: number;
    settleMs?: number;
    includeTextsAsTapTargets?: boolean;
    denyLabels?: string[];
    denyPatterns?: string[];
    seedActions?: SeedAction[];
  };
  report?: {
    outputDir?: string;
  };
};

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type UiNode = {
  tag: string;
  path: string;
  attrs: Record<string, string>;
  children: UiNode[];
};

type TapTarget = {
  id: string;
  label: string;
  type: string;
  path: string;
  bounds?: Bounds;
  selector: string;
};

type Finding = {
  severity: "error" | "warning";
  screenId: string;
  rule: string;
  message: string;
  element: {
    type: string;
    label?: string;
    path: string;
    bounds?: Bounds;
    attrs: Record<string, string>;
  };
};

type ScreenReport = {
  id: string;
  depth: number;
  title: string;
  signature: string;
  sourceFile: string;
  screenshotFile: string;
  tapTargets: TapTarget[];
};

type RunEvent = {
  level: "info" | "warning" | "error";
  message: string;
  timestamp: string;
  screenId?: string;
  details?: Record<string, unknown>;
};

type JsonReport = {
  generatedAt: string;
  platform: Platform;
  summary: {
    screensVisited: number;
    findings: number;
    errors: number;
    warnings: number;
    runtimeErrors: number;
    events: number;
    completed: boolean;
  };
  screens: ScreenReport[];
  findings: Finding[];
  events: RunEvent[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
});
const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const config = await loadConfig();
  await validateConfig(config);
  const managedProcesses = await bootstrapRuntime(config);

  const outputDir = resolve(process.env.REPORT_OUTPUT_DIR ?? config.report?.outputDir ?? "reports/a11y-crawl");
  await mkdir(outputDir, { recursive: true });

  let driver: Browser | undefined;
  const crawler = new Crawler(config, outputDir);
  const handleShutdown = async (signal: NodeJS.Signals) => {
    crawler.recordWarning(`Received ${signal}. Writing partial report before shutdown.`);
    await crawler.writeReport().catch(() => undefined);
    if (driver) {
      await driver.deleteSession().catch(() => undefined);
    }
    stopManagedProcesses(managedProcesses);
    process.exit(130);
  };
  process.once("SIGINT", handleShutdown);
  process.once("SIGTERM", handleShutdown);

  try {
    const capabilities = normalizeCapabilities(config);
    driver = await remote({
      ...parseServerUrl(config.appiumServerUrl),
      logLevel: "warn",
      capabilities,
    });
    crawler.setDriver(driver);
    await crawler.waitForAppReady();
    await crawler.runSeedActions();
    await crawler.crawl(0);
    crawler.markCompleted();
  } catch (error) {
    crawler.recordError("Crawler stopped because an unrecoverable error occurred.", error);
  } finally {
    await crawler.writeReport();
    if (driver) {
      await driver.deleteSession().catch(() => undefined);
    }
    stopManagedProcesses(managedProcesses);
    process.removeListener("SIGINT", handleShutdown);
    process.removeListener("SIGTERM", handleShutdown);
  }
}

class Crawler {
  private readonly visited = new Set<string>();
  private readonly attemptedActions = new Set<string>();
  private readonly recordedWarningKeys = new Set<string>();
  private readonly screens: ScreenReport[] = [];
  private readonly findings: Finding[] = [];
  private readonly events: RunEvent[] = [];
  private readonly startedAt = Date.now();
  private screenCounter = 0;
  private completed = false;
  private driver?: Browser;

  constructor(
    private readonly config: Config,
    private readonly outputDir: string,
  ) {}

  setDriver(driver: Browser): void {
    this.driver = driver;
  }

  async runSeedActions(): Promise<void> {
    const actions = this.config.crawl?.seedActions ?? [];
    for (const action of actions) {
      if (action.type === "pause") {
        await this.requireDriver().pause(action.ms);
        continue;
      }

      try {
        const element = await this.requireDriver().$(action.selector);
        await element.waitForDisplayed({ timeout: this.tapTimeoutMs });
        await element.click();
        await this.requireDriver().pause(this.settleMs);
        await this.recoverFromBlockingUi();
      } catch (error) {
        if (action.required) {
          throw error;
        }

        this.recordWarning(`Optional seed action skipped. Element was not found: ${action.selector}`, error);
      }
    }
  }

  async waitForAppReady(): Promise<void> {
    const timeoutMs = this.config.crawl?.appReadyTimeoutMs ?? 120_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await this.recoverFromBlockingUi();
      const source = await this.requireDriver().getPageSource();
      const nodes = flattenNodes(parseSource(source));
      const visibleInteractiveCount = nodes
        .filter((node) => isDisplayed(node))
        .filter((node) => isTapCandidate(node, this.config)).length;

      if (visibleInteractiveCount > 0 && !looksLikeStartupScreen(nodes)) {
        return;
      }

      await this.requireDriver().pause(1_000);
    }

    this.recordWarning(`App did not become ready within ${timeoutMs}ms. Continuing with the current UI state.`);
  }

  async crawl(depth: number): Promise<void> {
    if (this.shouldStop(depth)) {
      return;
    }

    await this.recoverFromBlockingUi();

    const source = await this.requireDriver().getPageSource();
    const signature = signatureForSource(source);
    if (this.visited.has(signature)) {
      return;
    }

    this.visited.add(signature);

    const screenId = `screen-${String(++this.screenCounter).padStart(3, "0")}`;
    const sourceFile = join(this.outputDir, `${screenId}.xml`);
    const screenshotFile = join(this.outputDir, `${screenId}.png`);
    await writeFile(sourceFile, source);
    await this.requireDriver().saveScreenshot(screenshotFile);

    const root = parseSource(source);
    const nodes = flattenNodes(root);
    const tapTargets = this.findTapTargets(nodes);

    this.findings.push(...this.auditNodes(screenId, nodes));
    this.screens.push({
      id: screenId,
      depth,
      title: inferScreenTitle(nodes),
      signature,
      sourceFile: relative(this.outputDir, sourceFile),
      screenshotFile: relative(this.outputDir, screenshotFile),
      tapTargets,
    });
    await this.writeReport();

    for (const target of tapTargets.slice(0, this.maxActionsPerScreen)) {
      if (this.shouldStop(depth)) {
        return;
      }

      const actionKey = `${signature}:${target.id}`;
      if (this.attemptedActions.has(actionKey)) {
        continue;
      }

      this.attemptedActions.add(actionKey);
      try {
        const before = signatureForSource(await this.requireDriver().getPageSource());
        const tapped = await this.tapTarget(target);
        if (!tapped) {
          continue;
        }

        await this.requireDriver().pause(this.settleMs);
        await this.recoverFromBlockingUi(screenId);
        const after = signatureForSource(await this.requireDriver().getPageSource());
        if (after !== before) {
          await this.crawl(depth + 1);
          await this.goBackToPreviousScreen(before);
        }
      } catch (error) {
        this.recordError(`Action failed: ${target.label}`, error, screenId, {
          selector: target.selector,
          path: target.path,
        });
        await this.recoverFromBlockingUi(screenId);
      }
    }
  }

  async writeReport(): Promise<void> {
    const jsonReport: JsonReport = {
      generatedAt: new Date().toISOString(),
      platform: this.config.platform,
      summary: {
        screensVisited: this.screens.length,
        findings: this.findings.length,
        errors: this.findings.filter((finding) => finding.severity === "error").length,
        warnings: this.findings.filter((finding) => finding.severity === "warning").length,
        runtimeErrors: this.events.filter((event) => event.level === "error").length,
        events: this.events.length,
        completed: this.completed,
      },
      screens: this.screens,
      findings: this.findings,
      events: this.events,
    };

    await writeFile(
      join(this.outputDir, "report.json"),
      JSON.stringify(jsonReport, null, 2),
    );
    await writeFile(join(this.outputDir, "report.md"), renderMarkdownReport(jsonReport));
  }

  markCompleted(): void {
    this.completed = true;
  }

  recordError(message: string, error: unknown, screenId?: string, details?: Record<string, unknown>): void {
    this.events.push({
      level: "error",
      message,
      screenId,
      timestamp: new Date().toISOString(),
      details: {
        ...details,
        error: errorToString(error),
      },
    });
  }

  recordWarning(message: string, error?: unknown, screenId?: string): void {
    this.events.push({
      level: "warning",
      message,
      screenId,
      timestamp: new Date().toISOString(),
      details: error ? { error: errorToString(error) } : undefined,
    });
  }

  recordWarningOnce(key: string, message: string, error?: unknown, screenId?: string): void {
    if (this.recordedWarningKeys.has(key)) {
      return;
    }

    this.recordedWarningKeys.add(key);
    this.recordWarning(message, error, screenId);
  }

  private findTapTargets(nodes: UiNode[]): TapTarget[] {
    return nodes
      .filter((node) => isDisplayed(node))
      .filter((node) => isTapCandidate(node, this.config))
      .filter((node) => !this.isDenied(node))
      .map((node) => ({
        id: stableElementId(node),
        label: accessibleName(node) || "(unlabeled)",
        type: node.tag,
        path: node.path,
        bounds: boundsOf(node),
        selector: selectorForNode(node, this.config.platform),
      }))
      .filter(uniqueBy((target) => target.id))
      .slice(0, this.maxTapTargetsPerScreen);
  }

  private auditNodes(screenId: string, nodes: UiNode[]): Finding[] {
    const findings: Finding[] = [];

    for (const node of nodes) {
      if (!isDisplayed(node)) {
        continue;
      }

      const name = accessibleName(node);
      const tappable = isTapCandidate(node, this.config);
      const attrs = node.attrs;

      if (tappable && !name) {
        findings.push({
          severity: "error",
          screenId,
          rule: "interactive-name",
          message: "Interactive element has no accessible name.",
          element: findingElement(node),
        });
      }

      if (tappable && name && name.trim().length < 2) {
        findings.push({
          severity: "warning",
          screenId,
          rule: "short-name",
          message: "Interactive element has a very short accessible name.",
          element: findingElement(node),
        });
      }

      const bounds = boundsOf(node);
      if (tappable && bounds && (bounds.width < 44 || bounds.height < 44)) {
        const elementName = name ? `"${name}"` : node.attrs.name ? `"${node.attrs.name}"` : node.tag;
        findings.push({
          severity: "warning",
          screenId,
          rule: "touch-target-size",
          message: `Interactive element ${elementName} is ${Math.round(bounds.width)}x${Math.round(bounds.height)}. Recommended minimum is 44x44 points/pixels.`,
          element: findingElement(node),
        });
      }

      if (this.config.platform === "android" && attrs.clickable === "true" && attrs.enabled === "true" && attrs["content-desc"] === "") {
        findings.push({
          severity: "error",
          screenId,
          rule: "android-content-desc",
          message: "Clickable Android element has an empty content-desc.",
          element: findingElement(node),
        });
      }
    }

    return findings;
  }

  private async tapTarget(target: TapTarget): Promise<boolean> {
    try {
      const element = await this.requireDriver().$(target.selector);
      await element.waitForDisplayed({ timeout: this.tapTimeoutMs });
      await element.click();
      return true;
    } catch {
      if (!target.bounds) {
        return false;
      }

      try {
        await this.requireDriver().action("pointer", {
          parameters: { pointerType: "touch" },
        })
          .move({
            x: Math.round(target.bounds.x + target.bounds.width / 2),
            y: Math.round(target.bounds.y + target.bounds.height / 2),
          })
          .down()
          .up()
          .perform();
        return true;
      } catch {
        return false;
      }
    }
  }

  private async goBackToPreviousScreen(previousSignature: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.recoverFromBlockingUi();
      await this.requireDriver().back();
      await this.requireDriver().pause(this.settleMs);
      const current = signatureForSource(await this.requireDriver().getPageSource());
      if (current === previousSignature) {
        return;
      }
    }
    this.recordWarningOnce(
      "navigation-back-failed",
      "Could not navigate back to the previous screen. The crawler continued from the current screen.",
    );
  }

  private isDenied(node: UiNode): boolean {
    const denyLabels = this.config.crawl?.denyLabels ?? [];
    const name = accessibleName(node).toLowerCase();
    const deniedByLabel = denyLabels.some((label) => name.includes(label.toLowerCase()));
    const deniedByPattern = (this.config.crawl?.denyPatterns ?? []).some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(name);
      } catch {
        return false;
      }
    });

    return deniedByLabel || deniedByPattern;
  }

  private async recoverFromBlockingUi(screenId?: string): Promise<void> {
    const driver = this.requireDriver();
    try {
      const text = await driver.getAlertText();
      await driver.acceptAlert();
      this.events.push({
        level: "warning",
        message: "System alert accepted automatically.",
        timestamp: new Date().toISOString(),
        screenId,
        details: { text },
      });
      await driver.pause(this.settleMs);
    } catch {
      // No native alert is currently displayed.
    }

    const recoverySelectors = recoverySelectorsForPlatform(this.config.platform);

    for (const selector of recoverySelectors) {
      try {
        const element = await driver.$(selector);
        if (await element.isDisplayed()) {
          await element.click();
          this.events.push({
            level: "warning",
            message: "Blocking overlay control tapped automatically.",
            timestamp: new Date().toISOString(),
            screenId,
            details: { selector },
          });
          await driver.pause(this.settleMs);
          return;
        }
      } catch {
        // Continue probing the next recovery selector.
      }
    }
  }

  private shouldStop(depth: number): boolean {
    if (depth > this.maxDepth) {
      return true;
    }

    if (this.screens.length >= this.maxScreens) {
      return true;
    }

    if (Date.now() - this.startedAt > this.maxDurationMs) {
      this.recordWarningOnce("max-duration-reached", "Crawl stopped because maxDurationMs was reached.");
      return true;
    }

    return false;
  }

  private requireDriver(): Browser {
    if (!this.driver) {
      throw new Error("WebDriver session has not been initialized.");
    }

    return this.driver;
  }

  private get maxDepth(): number {
    return this.config.crawl?.maxDepth ?? 8;
  }

  private get maxScreens(): number {
    return this.config.crawl?.maxScreens ?? 40;
  }

  private get maxDurationMs(): number {
    return this.config.crawl?.maxDurationMs ?? 600_000;
  }

  private get maxActionsPerScreen(): number {
    return this.config.crawl?.maxActionsPerScreen ?? 8;
  }

  private get maxTapTargetsPerScreen(): number {
    return this.config.crawl?.maxTapTargetsPerScreen ?? 24;
  }

  private get tapTimeoutMs(): number {
    return this.config.crawl?.tapTimeoutMs ?? 2500;
  }

  private get settleMs(): number {
    return this.config.crawl?.settleMs ?? 900;
  }
}

async function loadConfig(): Promise<Config> {
  const configIndex = process.argv.indexOf("--config");
  const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : "a11y-crawler.config.json";
  if (!configPath) {
    throw new Error("Missing config path after --config.");
  }

  const url = new URL(resolve(configPath), "file://");
  const config = (await import(url.href, { with: { type: "json" } })).default as Config;
  return config;
}

function normalizeCapabilities(config: Config): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    "appium:newCommandTimeout": 300,
  };

  if (config.platform === "ios") {
    Object.assign(defaults, {
      "appium:autoAcceptAlerts": true,
      "appium:waitForIdleTimeout": 2,
      "appium:reduceMotion": true,
    });
  }

  if (config.platform === "android") {
    Object.assign(defaults, {
      "appium:autoGrantPermissions": true,
    });
  }

  return {
    ...defaults,
    ...config.capabilities,
  };
}

async function bootstrapRuntime(config: Config): Promise<ChildProcess[]> {
  const processes: ChildProcess[] = [];
  const bootstrap = config.bootstrap;
  if (!bootstrap) {
    return processes;
  }

  const startupTimeoutMs = bootstrap.startupTimeoutMs ?? 90_000;

  if (bootstrap.startSimulator && config.platform === "ios") {
    await bootIosSimulator(bootstrap.simulatorName ?? String(config.capabilities["appium:deviceName"] ?? ""));
  }

  if (bootstrap.startExpo && bootstrap.expoCommand) {
    processes.push(spawnManagedCommand(bootstrap.expoCommand, bootstrap.expoCwd));
    await sleep(Math.min(startupTimeoutMs, 15_000));
  }

  if (bootstrap.startAppium) {
    if (!(await canReachUrl(config.appiumServerUrl))) {
      processes.push(spawnManagedCommand(bootstrap.appiumCommand ?? "yarn appium:server"));
      await waitForUrl(config.appiumServerUrl, startupTimeoutMs);
    }
  }

  return processes;
}

async function bootIosSimulator(deviceName: string): Promise<void> {
  if (!deviceName) {
    return;
  }

  try {
    const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devices", "available", "--json"]);
    const devices = JSON.parse(stdout) as {
      devices?: Record<string, Array<{ name: string; udid: string; state: string }>>;
    };
    const device = Object.values(devices.devices ?? {})
      .flat()
      .find((candidate) => candidate.name === deviceName);

    if (!device) {
      console.warn(`Could not find iOS simulator named "${deviceName}". Appium will try to select a matching simulator.`);
      return;
    }

    if (device.state !== "Booted") {
      await execFileAsync("xcrun", ["simctl", "boot", device.udid]).catch(() => undefined);
    }

    await execFileAsync("open", ["-a", "Simulator"]).catch(() => undefined);
  } catch {
    console.warn("Could not boot iOS Simulator automatically. Appium will continue with its own simulator selection.");
  }
}

function spawnManagedCommand(command: string, cwd?: string): ChildProcess {
  const child = spawn(command, {
    cwd: cwd ? resolve(cwd) : process.cwd(),
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.warn(`Managed command exited with code ${code}: ${command}`);
    }
  });

  return child;
}

function stopManagedProcesses(processes: ChildProcess[]): void {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function canReachUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachUrl(url)) {
      return;
    }
    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function validateConfig(config: Config): Promise<void> {
  if (config.platform !== "ios") {
    return;
  }

  const platformVersion = String(config.capabilities["appium:platformVersion"] ?? "");
  if (!platformVersion) {
    return;
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("xcrun", ["simctl", "list", "runtimes", "--json"]));
  } catch {
    console.warn("Could not inspect iOS Simulator runtimes with xcrun. Continuing with Appium session creation.");
    return;
  }

  const runtimes = JSON.parse(stdout) as {
    runtimes?: Array<{ platform?: string; version?: string; isAvailable?: boolean }>;
  };
  const iosVersions = (runtimes.runtimes ?? [])
    .filter((runtime) => runtime.platform === "iOS" && runtime.isAvailable !== false && runtime.version)
    .map((runtime) => String(runtime.version));

  if (iosVersions.length > 0 && !iosVersions.includes(platformVersion)) {
    throw new Error(
      `Configured appium:platformVersion "${platformVersion}" is not installed. Available iOS Simulator versions: ${iosVersions.join(", ")}. Update a11y-crawler.config.json or remove appium:platformVersion to let Appium pick a matching simulator.`,
    );
  }
}

function parseServerUrl(serverUrl: string): {
  protocol: "http" | "https";
  hostname: string;
  port: number;
  path: string;
} {
  const url = new URL(serverUrl);
  return {
    protocol: url.protocol.replace(":", "") as "http" | "https",
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    path: url.pathname === "/" ? "/" : url.pathname,
  };
}

function parseSource(source: string): UiNode {
  const parsed = parser.parse(source) as Record<string, unknown>;
  const [rootTag, rootValue] = Object.entries(parsed).find(([tag]) => !tag.startsWith("?")) ?? ["root", {}];
  return normalizeNode(rootTag, rootValue, rootTag);
}

function normalizeNode(tag: string, value: unknown, path: string): UiNode {
  const attrs: Record<string, string> = {};
  const children: UiNode[] = [];

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(child)) {
        child.forEach((item, index) => children.push(normalizeNode(key, item, `${path}/${key}[${index}]`)));
      } else if (child && typeof child === "object") {
        children.push(normalizeNode(key, child, `${path}/${key}[0]`));
      } else {
        attrs[key] = String(child ?? "");
      }
    }
  }

  return { tag, path, attrs, children };
}

function flattenNodes(root: UiNode): UiNode[] {
  return [root, ...root.children.flatMap(flattenNodes)];
}

function isDisplayed(node: UiNode): boolean {
  const visible = node.attrs.visible ?? node.attrs.displayed;
  if (visible === "false") {
    return false;
  }

  const enabled = node.attrs.enabled;
  return enabled !== "false";
}

function isTapCandidate(node: UiNode, config: Config): boolean {
  if (config.platform === "ios") {
    const interactiveTypes = new Set([
      "XCUIElementTypeButton",
      "XCUIElementTypeCell",
      "XCUIElementTypeLink",
      "XCUIElementTypeSwitch",
      "XCUIElementTypeTabBar",
      "XCUIElementTypeTabBarButton",
      "XCUIElementTypeTextField",
      "XCUIElementTypeSecureTextField",
    ]);

    if (interactiveTypes.has(node.tag)) {
      return true;
    }

    return Boolean(config.crawl?.includeTextsAsTapTargets && node.tag === "XCUIElementTypeStaticText");
  }

  return node.attrs.clickable === "true" || node.attrs.focusable === "true";
}

function looksLikeStartupScreen(nodes: UiNode[]): boolean {
  const visibleNames = nodes
    .filter((node) => isDisplayed(node))
    .map(accessibleName)
    .join(" ")
    .toLowerCase();
  const visibleTypes = nodes
    .filter((node) => isDisplayed(node))
    .map((node) => `${node.tag} ${node.attrs.name ?? ""}`)
    .join(" ")
    .toLowerCase();

  return [
    "splashscreen",
    "splash screen",
    "downloading",
    "loading",
    "bundling",
    "connecting to metro",
  ].some((marker) => visibleNames.includes(marker) || visibleTypes.includes(marker));
}

function accessibleName(node: UiNode): string {
  return firstNonEmpty([
    node.attrs.label,
    node.attrs["content-desc"],
    node.attrs.text,
    node.attrs.value,
  ]);
}

function selectorForNode(node: UiNode, platform: Platform): string {
  const name = accessibleName(node);
  const automationId = firstNonEmpty([node.attrs.name, node.attrs["resource-id"]]);

  if (automationId) {
    return platform === "ios"
      ? `~${automationId}`
      : `//*[@resource-id=${xpathLiteral(automationId)} or @content-desc=${xpathLiteral(automationId)}]`;
  }

  if (name) {
    return platform === "ios" ? `~${name}` : `//*[@content-desc=${xpathLiteral(name)} or @text=${xpathLiteral(name)}]`;
  }

  const bounds = node.attrs.bounds;
  if (bounds) {
    return `//*[@bounds=${xpathLiteral(bounds)}]`;
  }

  return `/${node.path}`;
}

function recoverySelectorsForPlatform(platform: Platform): string[] {
  const labels = [
    "Dismiss",
    "Close",
    "OK",
    "Reload",
    "Retry",
    "Try Again",
    "Continue",
    "Cancel",
    "Not Now",
    "Later",
    "Allow",
    "Allow While Using App",
    "Don't Allow",
    "Abbrechen",
    "Schliessen",
    "Schließen",
    "Erlauben",
    "Nicht erlauben",
    "Weiter",
    "Fortfahren",
    "Erneut laden",
  ];

  return labels.map((label) => platform === "ios" ? `~${label}` : androidTextSelector(label));
}

function androidTextSelector(label: string): string {
  const literal = xpathLiteral(label);
  return `//*[@content-desc=${literal} or @text=${literal}]`;
}

function stableElementId(node: UiNode): string {
  return hash(`${node.tag}:${accessibleName(node)}:${node.attrs.bounds ?? ""}:${node.path}`);
}

function signatureForSource(source: string): string {
  return hash(
    source
      .replaceAll(/time="\d+"/g, "")
      .replaceAll(/index="\d+"/g, "")
      .replaceAll(/\s+/g, " ")
      .slice(0, 200_000),
  );
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function firstNonEmpty(values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim().length > 0)?.trim() ?? "";
}

function boundsOf(node: UiNode): Bounds | undefined {
  const rect = [node.attrs.x, node.attrs.y, node.attrs.width, node.attrs.height].map(Number);
  if (rect.every(Number.isFinite)) {
    return { x: rect[0], y: rect[1], width: rect[2], height: rect[3] };
  }

  const androidBounds = node.attrs.bounds?.match(/\[(\d+),(\d+)]\[(\d+),(\d+)]/);
  if (androidBounds) {
    const [, x1, y1, x2, y2] = androidBounds.map(Number);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  return undefined;
}

function inferScreenTitle(nodes: UiNode[]): string {
  const candidates = nodes
    .filter((node) => isDisplayed(node))
    .map(accessibleName)
    .filter(Boolean);

  return candidates[0] ?? "Untitled screen";
}

function findingElement(node: UiNode): Finding["element"] {
  return {
    type: node.tag,
    label: accessibleName(node) || undefined,
    path: node.path,
    bounds: boundsOf(node),
    attrs: node.attrs,
  };
}

function uniqueBy<T>(getKey: (value: T) => string): (value: T) => boolean {
  const seen = new Set<string>();
  return (value: T) => {
    const key = getKey(value);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  };
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  if (!value.includes('"')) {
    return `"${value}"`;
  }

  return `concat('${value.replaceAll("'", `', "'", '`)}')`;
}

function renderMarkdownReport(report: {
  generatedAt: string;
  platform: Platform;
  summary: JsonReport["summary"];
  screens: ScreenReport[];
  findings: Finding[];
  events: RunEvent[];
}): string {
  const lines = [
    "# Mobile Accessibility Crawl Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform}`,
    "",
    "## Summary",
    "",
    `- Screens visited: ${report.summary.screensVisited}`,
    `- Findings: ${report.summary.findings}`,
    `- Errors: ${report.summary.errors}`,
    `- Warnings: ${report.summary.warnings}`,
    `- Runtime errors: ${report.summary.runtimeErrors}`,
    `- Completed: ${report.summary.completed ? "yes" : "no"}`,
    "",
    "## Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- [${finding.severity.toUpperCase()}] ${finding.rule} on ${finding.screenId}: ${finding.message}`,
        `  - Element: ${finding.element.type} ${finding.element.label ? `"${finding.element.label}"` : ""}`,
        `  - Path: ${finding.element.path}`,
      );
    }
  }

  lines.push("", "## Screens", "");
  for (const screen of report.screens) {
    lines.push(
      `- ${screen.id}: ${screen.title}`,
      `  - Depth: ${screen.depth}`,
      `  - Tap targets: ${screen.tapTargets.length}`,
      `  - Screenshot: ${screen.screenshotFile}`,
      `  - Source: ${screen.sourceFile}`,
    );
  }

  lines.push("", "## Runtime Events", "");
  if (report.events.length === 0) {
    lines.push("No runtime events.");
  } else {
    for (const event of report.events) {
      lines.push(`- [${event.level.toUpperCase()}] ${event.timestamp}: ${event.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
