"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  FolderClock,
  Gauge,
  Image as ImageIcon,
  Languages,
  ListChecks,
  Moon,
  Play,
  RefreshCw,
  Settings,
  Smartphone,
  Square,
  Sun,
  TerminalSquare,
  Trash2,
  XCircle,
} from "lucide-react";

type Locale = "en" | "tr";
type Theme = "light" | "dark";

type Finding = {
  severity: "error" | "warning";
  screenId: string;
  rule: string;
  message: string;
  standards?: Array<{ source: string; id: string; title: string; url: string }>;
  element: {
    type: string;
    label?: string;
    path: string;
    bounds?: { x: number; y: number; width: number; height: number };
  };
};

type RunEvent = {
  level: "info" | "warning" | "error";
  message: string;
  timestamp: string;
  screenId?: string;
  details?: Record<string, unknown>;
};

type GroupedRunEvent = RunEvent & {
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  screenIds: string[];
};

type ScreenReport = {
  id: string;
  depth: number;
  title: string;
  signature: string;
  sourceFile: string;
  screenshotFile: string;
  tapTargets: Array<{ id: string; label: string; type: string; selector: string }>;
};

type Report = {
  generatedAt: string;
  platform: "ios" | "android";
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

type CrawlStatus = {
  running: boolean;
  stopping?: boolean;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  runId?: string;
  logs: string[];
};

type RunSummary = {
  screensVisited?: number;
  findings?: number;
  errors?: number;
  warnings?: number;
  runtimeErrors?: number;
  completed?: boolean;
};

type RunListItem = {
  id: string;
  generatedAt: string;
  summary?: RunSummary;
};

type ConfigPayload = {
  capabilities?: Record<string, unknown>;
  bootstrap?: Record<string, unknown>;
};

type ConfigOptions = {
  devices: Array<{ name: string; udid: string; state: string; runtime: string }>;
  runtimes: Array<{ name: string; version: string; identifier: string }>;
  warning?: string;
};

type SetupState = {
  loaded: boolean;
  complete: boolean;
  deviceName: string;
  platformVersion: string;
  bundleId: string;
  startExpo: boolean;
  expoCwd: string;
  expoCommand: string;
  options: ConfigOptions;
  error?: string;
};

const copy = {
  en: {
    app: "Mobile A11y Crawler",
    reportsIntro: "Control simulator setup, crawls, and historical reports from one local workspace.",
    settings: "Settings",
    start: "Start Crawl",
    stop: "Stop",
    stopping: "Stopping",
    refresh: "Refresh",
    reports: "Reports",
    backToReports: "Back to Reports",
    previousReports: "Report History",
    noReports: "No reports yet.",
    open: "Open",
    delete: "Delete",
    configure: "Configure Simulator",
    simulatorSettings: "Simulator Settings",
    configureText: "Select an installed simulator/runtime and enter the Expo Dev Client bundle id before starting a crawl.",
    device: "Device",
    iosVersion: "iOS Version",
    bundleId: "Bundle ID",
    startExpo: "Start Expo server before crawling",
    expoPath: "Expo Project Path",
    expoPathHint: "Relative or absolute path to the Expo project.",
    expoCommand: "Expo Command",
    continue: "Continue",
    save: "Save",
    cancel: "Cancel",
    refreshDevices: "Refresh Devices",
    screens: "Screens",
    errors: "Errors",
    warnings: "Warnings",
    status: "Status",
    done: "Done",
    partial: "Partial",
    running: "Running",
    idle: "Idle",
    findings: "Findings",
    filterFindings: "Filter by rule, message, screen, or label",
    noFindings: "No findings match the current filter.",
    screenFindings: "screen findings",
    runtimeEvents: "Crawler Events",
    runtimeEventsHint: "Operational crawler events. These explain automation behavior and are not accessibility findings.",
    noEvents: "No runtime events.",
    crawlJob: "Crawl Job",
    logsEmpty: "No crawl logs yet.",
    openXml: "Open XML",
    loading: "Loading Simulator Options",
    loadingText: "Reading installed simulators and local configuration.",
    commandCenter: "Command Center",
    setup: "Setup",
    simulator: "Simulator",
    appBundle: "App Bundle",
    currentRun: "Current Run",
    localWorkspace: "Local Workspace",
    selectedScreen: "Selected Screen",
    tapTargets: "tap targets",
    noScreen: "No screen selected.",
    completed: "completed",
    incomplete: "partial",
    totalRuns: "total saved runs",
    latestReport: "Latest report",
    reportSummary: "Report Summary",
    evidence: "Evidence",
    reportPreparing: "Preparing report evidence",
    reportPreparingText: "The crawl is running. Screenshots and findings will appear as soon as the first screen is saved.",
    finalReport: "General Report",
    finalReportText: "The latest saved report is ready for review.",
    generatedAt: "Generated",
    runId: "Run ID",
    element: "Element",
    bounds: "Bounds",
    path: "Path",
  },
  tr: {
    app: "Mobile A11y Crawler",
    reportsIntro: "Simülatör ayarlarını, testleri ve geçmiş raporları tek lokal çalışma alanından yönet.",
    settings: "Ayarlar",
    start: "Testi Başlat",
    stop: "Durdur",
    stopping: "Durduruluyor",
    refresh: "Yenile",
    reports: "Raporlar",
    backToReports: "Raporlara Dön",
    previousReports: "Rapor Geçmişi",
    noReports: "Henüz rapor yok.",
    open: "Aç",
    delete: "Sil",
    configure: "Simülatörü Yapılandır",
    simulatorSettings: "Simülatör Ayarları",
    configureText: "Teste başlamadan önce yüklü simülatörü/sürümü seç ve Expo Dev Client bundle id değerini gir.",
    device: "Cihaz",
    iosVersion: "iOS Sürümü",
    bundleId: "Bundle ID",
    startExpo: "Testten önce Expo server'ı başlat",
    expoPath: "Expo Proje Yolu",
    expoPathHint: "Expo projesine göreli veya mutlak yol.",
    expoCommand: "Expo Komutu",
    continue: "Devam Et",
    save: "Kaydet",
    cancel: "İptal",
    refreshDevices: "Cihazları Yenile",
    screens: "Ekranlar",
    errors: "Hatalar",
    warnings: "Uyarılar",
    status: "Durum",
    done: "Tamamlandı",
    partial: "Kısmi",
    running: "Çalışıyor",
    idle: "Boşta",
    findings: "Bulgular",
    filterFindings: "Kural, mesaj, ekran veya label ile filtrele",
    noFindings: "Bu filtreye uygun bulgu yok.",
    screenFindings: "ekran bulgusu",
    runtimeEvents: "Test Olayları",
    runtimeEventsHint: "Crawler'ın çalışma davranışını açıklayan operasyonel olaylar. Bunlar erişilebilirlik bulgusu değildir.",
    noEvents: "Çalışma olayı yok.",
    crawlJob: "Test Süreci",
    logsEmpty: "Henüz test log'u yok.",
    openXml: "XML Aç",
    loading: "Simülatör Seçenekleri Yükleniyor",
    loadingText: "Yüklü simülatörler ve lokal yapılandırma okunuyor.",
    commandCenter: "Kontrol Merkezi",
    setup: "Kurulum",
    simulator: "Simülatör",
    appBundle: "App Bundle",
    currentRun: "Aktif Test",
    localWorkspace: "Lokal Çalışma Alanı",
    selectedScreen: "Seçili Ekran",
    tapTargets: "tap hedefi",
    noScreen: "Ekran seçilmedi.",
    completed: "tamamlandı",
    incomplete: "kısmi",
    totalRuns: "kayıtlı rapor",
    latestReport: "Son rapor",
    reportSummary: "Rapor Özeti",
    evidence: "Kanıt",
    reportPreparing: "Rapor kanıtları hazırlanıyor",
    reportPreparingText: "Test çalışıyor. İlk ekran kaydedildiğinde ekran görüntüleri ve bulgular burada görünecek.",
    finalReport: "Genel Rapor",
    finalReportText: "Kaydedilen son rapor incelemeye hazır.",
    generatedAt: "Oluşturulma",
    runId: "Run ID",
    element: "Element",
    bounds: "Ölçü",
    path: "Path",
  },
};

export default function DashboardPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const t = copy[locale];
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState("");
  const selectedRunRef = useRef("");
  const [report, setReport] = useState<Report | null>(null);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>({ running: false, logs: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setup, setSetup] = useState<SetupState>({
    loaded: false,
    complete: false,
    deviceName: "",
    platformVersion: "",
    bundleId: "",
    startExpo: false,
    expoCwd: "",
    expoCommand: "yarn expo start --dev-client",
    options: { devices: [], runtimes: [] },
  });

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    const storedLocale = localStorage.getItem("locale");
    const nextTheme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    if (storedLocale === "en" || storedLocale === "tr") setLocale(storedLocale);
  }, []);

  useEffect(() => {
    selectedRunRef.current = selectedRun;
  }, [selectedRun]);

  async function refresh() {
    await refreshSetup();

    const statusResponse = await fetch("/api/crawl/status");
    const nextStatus = statusResponse.ok ? ((await statusResponse.json()) as CrawlStatus) : undefined;
    if (nextStatus) {
      setCrawlStatus(nextStatus);
      if (nextStatus.runId && nextStatus.running && selectedRunRef.current !== nextStatus.runId) {
        selectedRunRef.current = nextStatus.runId;
        setSelectedRun(nextStatus.runId);
        setSelectedScreenId(null);
        setReport(createPendingReport(nextStatus.startedAt));
      }
    }

    const runsResponse = await fetch("/api/runs");
    const runsPayload = (await runsResponse.json()) as { runs: Array<string | RunListItem> };
    const normalizedRuns = runsPayload.runs.map((run) =>
      typeof run === "string" ? { id: run, generatedAt: new Date(0).toISOString() } : run,
    );
    setRuns(normalizedRuns);

    const targetRun = selectedRunRef.current || nextStatus?.runId || "";
    if (targetRun) {
      await loadReport(targetRun, { keepScreenSelection: true, pendingStartedAt: nextStatus?.startedAt });
    }
  }

  async function loadReport(
    runId: string,
    options: { keepScreenSelection: boolean; pendingStartedAt?: string } = { keepScreenSelection: false },
  ) {
    const reportResponse = await fetch(`/api/runs/${runId}/report`);
    if (reportResponse.ok) {
      const nextReport = normalizeReport((await reportResponse.json()) as Partial<Report>);
      setReport(nextReport);
      setSelectedScreenId((current) => {
        if (options.keepScreenSelection && current && nextReport.screens.some((screen) => screen.id === current)) {
          return current;
        }
        return nextReport.screens[0]?.id ?? null;
      });
      return;
    }

    setReport((current) => current ?? createPendingReport(options.pendingStartedAt));
  }

  async function openRun(runId: string) {
    selectedRunRef.current = runId;
    setSelectedRun(runId);
    await loadReport(runId);
  }

  async function deleteRun(runId: string) {
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    if (selectedRun === runId) {
      selectedRunRef.current = "";
      setSelectedRun("");
      setReport(null);
      setSelectedScreenId(null);
    }
    await refresh();
  }

  async function startCrawl() {
    if (!setup.complete) return;
    const response = await fetch("/api/crawl/start", { method: "POST" });
    const status = response.ok ? ((await response.json()) as CrawlStatus) : undefined;
    const runId = status?.runId ?? `run-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`;
    setCrawlStatus((current) => ({ ...current, ...(status ?? {}), running: status?.running ?? true, runId }));
    selectedRunRef.current = runId;
    setSelectedRun(runId);
    setSelectedScreenId(null);
    setReport(createPendingReport(status?.startedAt));
    await refresh();
  }

  async function stopCrawl() {
    await fetch("/api/crawl/stop", { method: "POST" });
    await refresh();
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(interval);
  }, []);

  async function refreshSetup() {
    const [configResponse, optionsResponse] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/config/options"),
    ]);
    if (!configResponse.ok || !optionsResponse.ok) {
      setSetup((current) => ({ ...current, loaded: true, complete: false, error: "Could not load local configuration." }));
      return;
    }

    const config = (await configResponse.json()) as ConfigPayload;
    const options = (await optionsResponse.json()) as ConfigOptions;
    const configuredDeviceName = String(config.capabilities?.["appium:deviceName"] ?? "");
    const configuredPlatformVersion = String(config.capabilities?.["appium:platformVersion"] ?? "");
    const deviceName = options.devices.some((device) => device.name === configuredDeviceName)
      ? configuredDeviceName
      : options.devices[0]?.name ?? "";
    const platformVersion = options.runtimes.some((runtime) => runtime.version === configuredPlatformVersion)
      ? configuredPlatformVersion
      : options.runtimes[0]?.version ?? "";
    const bundleId = String(config.capabilities?.["appium:bundleId"] ?? "");
    const startExpo = Boolean(config.bootstrap?.startExpo);
    const expoCwd = String(config.bootstrap?.expoCwd ?? "");
    const expoCommand = String(config.bootstrap?.expoCommand ?? "yarn expo start --dev-client");
    const hasRealBundleId = Boolean(bundleId && !isPlaceholderBundleId(bundleId));
    setSetup((current) => {
      const nextComplete = Boolean(deviceName && platformVersion && hasRealBundleId);
      if (!current.loaded && !nextComplete) setSettingsOpen(true);
      return {
        ...current,
        loaded: true,
        complete: nextComplete,
        deviceName: current.loaded ? current.deviceName : deviceName,
        platformVersion: current.loaded ? current.platformVersion : platformVersion,
        bundleId: current.loaded ? current.bundleId : bundleId,
        startExpo: current.loaded ? current.startExpo : startExpo,
        expoCwd: current.loaded ? current.expoCwd : expoCwd,
        expoCommand: current.loaded ? current.expoCommand : expoCommand,
        options,
        error: options.warning,
      };
    });
  }

  async function saveSetup() {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceName: setup.deviceName,
        platformVersion: setup.platformVersion,
        bundleId: setup.bundleId.trim(),
        startExpo: setup.startExpo,
        expoCwd: setup.expoCwd.trim(),
        expoCommand: setup.expoCommand.trim(),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "Could not save configuration." }))) as { error?: string };
      setSetup((current) => ({ ...current, error: payload.error ?? "Could not save configuration." }));
      return;
    }

    setSetup((current) => ({ ...current, complete: true, error: undefined }));
    setSettingsOpen(false);
    await refresh();
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  function toggleLocale() {
    const nextLocale = locale === "en" ? "tr" : "en";
    setLocale(nextLocale);
    localStorage.setItem("locale", nextLocale);
  }

  const selectedScreen = useMemo(
    () => report?.screens.find((screen) => screen.id === selectedScreenId) ?? report?.screens[0],
    [report, selectedScreenId],
  );

  const filteredFindings = useMemo(() => {
    const screenFindings = selectedScreen
      ? report?.findings.filter((finding) => finding.screenId === selectedScreen.id) ?? []
      : report?.findings ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return screenFindings;
    return screenFindings.filter((finding) =>
      [finding.rule, finding.message, finding.screenId, finding.element.label ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [report, query, selectedScreen]);

  if (!setup.loaded) {
    return (
      <SetupShell locale={locale} theme={theme} t={t} toggleLocale={toggleLocale} toggleTheme={toggleTheme}>
        <section className="setup-card">
          <header>
            <Settings size={32} />
            <h1>{t.loading}</h1>
            <p>{t.loadingText}</p>
          </header>
        </section>
      </SetupShell>
    );
  }

  if (settingsOpen || !setup.complete) {
    return (
      <SetupShell locale={locale} theme={theme} t={t} toggleLocale={toggleLocale} toggleTheme={toggleTheme}>
        <section className="setup-card">
          <header>
            <Settings size={32} />
            <p className="eyebrow">{t.setup}</p>
            <h1>{setup.complete ? t.simulatorSettings : t.configure}</h1>
            <p>{t.configureText}</p>
          </header>
          <div className="form-grid">
            <label className="field">
              {t.device}
              <select value={setup.deviceName} onChange={(event) => setSetup((current) => ({ ...current, deviceName: event.target.value }))}>
                {setup.options.devices.length === 0 ? <option value="">No devices found</option> : null}
                {setup.options.devices.map((device) => (
                  <option key={`${device.runtime}-${device.name}`} value={device.name}>{device.name} · {device.state}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {t.iosVersion}
              <select value={setup.platformVersion} onChange={(event) => setSetup((current) => ({ ...current, platformVersion: event.target.value }))}>
                {setup.options.runtimes.length === 0 ? <option value="">No runtimes found</option> : null}
                {setup.options.runtimes.map((runtime) => <option key={runtime.version} value={runtime.version}>{runtime.name}</option>)}
              </select>
            </label>
            <label className="field full">
              {t.bundleId}
              <input value={setup.bundleId} onChange={(event) => setSetup((current) => ({ ...current, bundleId: event.target.value }))} placeholder="com.yourcompany.yourexpoapp" />
            </label>
            <label className="checkbox-row field full">
              <input type="checkbox" checked={setup.startExpo} onChange={(event) => setSetup((current) => ({ ...current, startExpo: event.target.checked }))} />
              {t.startExpo}
            </label>
            {setup.startExpo ? (
              <>
                <label className="field full">
                  {t.expoPath}
                  <input value={setup.expoCwd} onChange={(event) => setSetup((current) => ({ ...current, expoCwd: event.target.value }))} placeholder="../your-expo-app" />
                  <small>{t.expoPathHint}</small>
                </label>
                <label className="field full">
                  {t.expoCommand}
                  <input value={setup.expoCommand} onChange={(event) => setSetup((current) => ({ ...current, expoCommand: event.target.value }))} placeholder="yarn expo start --dev-client" />
                </label>
              </>
            ) : null}
          </div>
          {setup.error ? <p className="setup-error">{setup.error}</p> : null}
          <div className="form-actions">
            {setup.complete ? <button className="secondary" onClick={() => setSettingsOpen(false)}>{t.cancel}</button> : null}
            <button className="secondary" onClick={() => void refreshSetup()}><RefreshCw size={16} /> {t.refreshDevices}</button>
            <button disabled={!setup.deviceName || !setup.platformVersion || !setup.bundleId.trim() || isPlaceholderBundleId(setup.bundleId)} onClick={() => void saveSetup()}>
              {setup.complete ? t.save : t.continue}
            </button>
          </div>
        </section>
      </SetupShell>
    );
  }

  return (
    <main className="app-shell">
      <section className="content-shell">
        <CommandBar
          crawlStatus={crawlStatus}
          locale={locale}
          report={report}
          setup={setup}
          setupComplete={setup.complete}
          t={t}
          theme={theme}
          toggleLocale={toggleLocale}
          toggleTheme={toggleTheme}
          refresh={refresh}
          startCrawl={startCrawl}
          stopCrawl={stopCrawl}
          openSettings={() => setSettingsOpen(true)}
          backToReports={() => {
            selectedRunRef.current = "";
            setSelectedRun("");
            setReport(null);
            setSelectedScreenId(null);
          }}
        />

        {!report ? (
          <HomeView crawlStatus={crawlStatus} runs={runs} t={t} openRun={openRun} deleteRun={deleteRun} />
        ) : (
          <ReportView
            crawlStatus={crawlStatus}
            filteredFindings={filteredFindings}
            query={query}
            report={report}
            selectedRun={selectedRun}
            selectedScreen={selectedScreen}
            setQuery={setQuery}
            setSelectedScreenId={setSelectedScreenId}
            t={t}
          />
        )}
      </section>
    </main>
  );
}

function SetupShell({ children, locale, theme, t, toggleLocale, toggleTheme }: { children: React.ReactNode; locale: Locale; theme: Theme; t: typeof copy.en; toggleLocale: () => void; toggleTheme: () => void }) {
  return (
    <main className="setup-shell">
      <div className="setup-actions">
        <button className="secondary icon-button" onClick={toggleTheme} aria-label="Toggle theme">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
        <button className="secondary" onClick={toggleLocale} aria-label="Toggle language"><Languages size={16} /> {locale.toUpperCase()}</button>
      </div>
      {children}
    </main>
  );
}

function CommandBar(props: {
  crawlStatus: CrawlStatus;
  locale: Locale;
  report: Report | null;
  setup: SetupState;
  setupComplete: boolean;
  t: typeof copy.en;
  theme: Theme;
  toggleLocale: () => void;
  toggleTheme: () => void;
  refresh: () => Promise<void>;
  startCrawl: () => Promise<void>;
  stopCrawl: () => Promise<void>;
  openSettings: () => void;
  backToReports: () => void;
}) {
  const { crawlStatus, locale, report, setup, setupComplete, t, theme } = props;
  return (
    <header className="command-bar">
      <div className="command-title">
        <span className={crawlStatus.running ? "status-pill live" : "status-pill"}>
          <span className="status-dot" /> {crawlStatus.stopping ? t.stopping : crawlStatus.running ? t.running : t.idle}
        </span>
        <h1>{report ? t.reportSummary : t.commandCenter}</h1>
        <p>{report ? `${report.platform.toUpperCase()} · ${formatRunDate(report.generatedAt)}` : t.reportsIntro}</p>
      </div>
      <div className="workspace-chip" aria-label={t.localWorkspace}>
        <Smartphone size={18} />
        <div>
          <span>{t.localWorkspace}</span>
          <strong>{setup.deviceName || t.simulator}</strong>
          <small>{setup.platformVersion ? `iOS ${setup.platformVersion}` : t.iosVersion} · {setup.bundleId || t.appBundle}</small>
        </div>
      </div>
      <div className="command-actions">
        {report ? <button className="secondary" onClick={props.backToReports}><FolderClock size={16} /> {t.backToReports}</button> : null}
        <button className="secondary" onClick={props.openSettings}><Settings size={16} /> {t.settings}</button>
        {crawlStatus.running ? (
          <button className="danger" disabled={crawlStatus.stopping} onClick={() => void props.stopCrawl()}><Square size={16} /> {crawlStatus.stopping ? t.stopping : t.stop}</button>
        ) : (
          <button disabled={!setupComplete} onClick={() => void props.startCrawl()}><Play size={16} /> {t.start}</button>
        )}
        <button className="secondary" onClick={() => void props.refresh()}><RefreshCw size={16} /> {t.refresh}</button>
        <button className="secondary" onClick={props.toggleTheme} aria-label="Toggle theme">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
        <button className="secondary" onClick={props.toggleLocale} aria-label="Toggle language"><Languages size={16} /> {locale.toUpperCase()}</button>
      </div>
    </header>
  );
}

function HomeView({ crawlStatus, runs, t, openRun, deleteRun }: { crawlStatus: CrawlStatus; runs: RunListItem[]; t: typeof copy.en; openRun: (runId: string) => Promise<void>; deleteRun: (runId: string) => Promise<void> }) {
  const latestRun = runs[0];
  return (
    <div className="dashboard-grid">
      <section className="overview-grid" aria-label={t.reportSummary}>
        <Metric icon={<FolderClock />} label={t.totalRuns} value={runs.length} foot={latestRun ? `${t.latestReport}: ${formatRunDate(latestRun.generatedAt)}` : t.noReports} />
        <Metric icon={<Smartphone />} label={t.screens} value={latestRun?.summary?.screensVisited ?? 0} foot={latestRun ? formatRunSummary(latestRun.summary) : t.noReports} />
        <Metric icon={<XCircle />} label={t.errors} value={(latestRun?.summary?.errors ?? 0) + (latestRun?.summary?.runtimeErrors ?? 0)} tone="bad" foot={t.errors} />
        <Metric icon={<AlertTriangle />} label={t.warnings} value={latestRun?.summary?.warnings ?? 0} tone="warn" foot={t.warnings} />
      </section>

      <section className="home-grid">
        <section className="panel">
          <header className="panel-header">
            <div>
              <div className="panel-title"><ListChecks size={18} /> {t.previousReports}</div>
              <p className="panel-subtitle">{runs.length} {t.totalRuns}</p>
            </div>
          </header>
          <div className="panel-body">
            {runs.length === 0 ? (
              <div className="empty-state">
                <FolderClock size={34} />
                <strong>{t.noReports}</strong>
                <p>{t.reportsIntro}</p>
              </div>
            ) : (
              <div className="run-list">
                {runs.map((run) => (
                  <article className="run-row" key={run.id}>
                    <div className="run-meta">
                      <strong>{formatRunDate(run.generatedAt)}</strong>
                      <code>{run.id}</code>
                      <small>{formatRunSummary(run.summary)}</small>
                    </div>
                    <div className="run-actions">
                      <button onClick={() => void openRun(run.id)}>{t.open}</button>
                      <button className="secondary danger-text" disabled={crawlStatus.running} onClick={() => void deleteRun(run.id)}><Trash2 size={16} /> {t.delete}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <header className="panel-header">
            <div className="panel-title"><TerminalSquare size={18} /> {t.currentRun}</div>
          </header>
          <div className="panel-body">
            <LogPanel status={crawlStatus} t={t} />
          </div>
        </section>
      </section>
    </div>
  );
}

function ReportView(props: {
  crawlStatus: CrawlStatus;
  filteredFindings: Finding[];
  query: string;
  report: Report;
  selectedRun: string;
  selectedScreen?: ScreenReport;
  setQuery: (query: string) => void;
  setSelectedScreenId: (screenId: string) => void;
  t: typeof copy.en;
}) {
  const { crawlStatus, filteredFindings, query, report, selectedRun, selectedScreen, t } = props;
  const groupedEvents = useMemo(() => groupRunEvents(report.events), [report.events]);
  return (
    <div className="dashboard-grid">
      <section className="overview-grid" aria-label={t.reportSummary}>
        <Metric icon={<Smartphone />} label={t.screens} value={report.summary.screensVisited} foot={`${report.screens.length} ${t.evidence}`} />
        <Metric icon={<XCircle />} label={t.errors} value={report.summary.errors + report.summary.runtimeErrors} tone="bad" foot={`${report.summary.runtimeErrors} runtime`} />
        <Metric icon={<AlertTriangle />} label={t.warnings} value={report.summary.warnings} tone="warn" foot={`${report.summary.findings} ${t.findings}`} />
        <Metric icon={crawlStatus.running ? <Clock /> : report.summary.completed ? <CheckCircle2 /> : <Gauge />} label={t.status} value={crawlStatus.stopping ? t.stopping : crawlStatus.running ? t.running : report.summary.completed ? t.done : t.partial} foot={report.summary.completed ? t.completed : t.incomplete} />
      </section>

      {!crawlStatus.running ? (
        <section className="panel final-summary-panel">
          <header className="panel-header">
            <div>
              <div className="panel-title"><CheckCircle2 size={18} /> {t.finalReport}</div>
              <p className="panel-subtitle">{t.finalReportText}</p>
            </div>
          </header>
          <div className="summary-facts">
            <SummaryFact label={t.status} value={report.summary.completed ? t.done : t.partial} />
            <SummaryFact label={t.generatedAt} value={formatRunDate(report.generatedAt)} />
            <SummaryFact label={t.runId} value={selectedRun} />
            <SummaryFact label={t.runtimeEvents} value={report.summary.events} />
          </div>
        </section>
      ) : null}

      <section className="report-workspace">
        <aside className="panel screen-list">
          <header className="panel-header">
            <div>
              <div className="panel-title"><ImageIcon size={18} /> {t.screens}</div>
              <p className="panel-subtitle">{report.screens.length} {t.screens}</p>
            </div>
          </header>
          <div className="screen-scroll">
            {report.screens.map((screen) => (
              <button key={screen.id} className={screen.id === selectedScreen?.id ? "screen-row active" : "screen-row"} onClick={() => props.setSelectedScreenId(screen.id)}>
                <span>{screen.id} · depth {screen.depth}</span>
                <strong>{screen.title}</strong>
                <small>{screen.tapTargets.length} {t.tapTargets}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel report-preview">
          <header className="panel-header">
            <div>
              <div className="panel-title"><Smartphone size={18} /> {selectedScreen?.title ?? t.selectedScreen}</div>
              <p className="panel-subtitle">{selectedScreen ? `${selectedScreen.id} · ${selectedScreen.tapTargets.length} ${t.tapTargets}` : t.noScreen}</p>
            </div>
            {selectedScreen ? (
              <div className="preview-header-actions">
                <a className="secondary-link" href={`/api/runs/${selectedRun}/artifact/${selectedScreen.sourceFile}`} target="_blank" rel="noreferrer"><FileText size={16} /> {t.openXml}</a>
              </div>
            ) : null}
          </header>
          <div className="device-preview-frame">
            {selectedScreen ? (
              <NextImage
                alt={`Screenshot for ${selectedScreen.id}`}
                className="device-shot"
                height={932}
                src={`/api/runs/${selectedRun}/artifact/${selectedScreen.screenshotFile}`}
                unoptimized
                width={430}
              />
            ) : (
              <div className="empty-state">
                <ImageIcon size={34} />
                <strong>{report.screens.length === 0 && crawlStatus.running ? t.reportPreparing : t.noScreen}</strong>
                <p>{report.screens.length === 0 && crawlStatus.running ? t.reportPreparingText : ""}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="panel detail-stack">
          <header className="panel-header">
            <div>
              <div className="panel-title"><BarChart3 size={18} /> {t.findings}</div>
              <p className="panel-subtitle">{filteredFindings.length} {t.screenFindings} · {report.findings.length} total</p>
            </div>
          </header>
          <div className="detail-scroll">
            <input className="search-field" value={query} onChange={(event) => props.setQuery(event.target.value)} placeholder={t.filterFindings} />
            <div className="finding-list">
              {filteredFindings.length === 0 ? <p className="muted">{t.noFindings}</p> : filteredFindings.map((finding, index) => (
                <article key={`${finding.screenId}-${finding.rule}-${index}`} className={`finding-card ${finding.severity}`}>
                  <strong className={finding.severity}>{findingTitle(finding)}</strong>
                  <span>{finding.screenId} · {finding.rule}</span>
                  <p>{finding.message}</p>
                  <dl className="finding-meta">
                    <div><dt>{t.element}</dt><dd>{finding.element.label ? `${finding.element.type} · ${finding.element.label}` : finding.element.type}</dd></div>
                    {finding.element.bounds ? <div><dt>{t.bounds}</dt><dd>{formatBounds(finding.element.bounds)}</dd></div> : null}
                    <div><dt>{t.path}</dt><dd>{finding.element.path}</dd></div>
                  </dl>
                  {finding.standards && finding.standards.length > 0 ? (
                    <div className="standard-chip-list">
                      {finding.standards.map((standard) => (
                        <a key={`${standard.source}-${standard.id}`} href={standard.url} target="_blank" rel="noreferrer">
                          {standard.source} {standard.id}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="section-gap">
              <div className="panel-title"><AlertTriangle size={18} /> {t.runtimeEvents}</div>
              <div className="section-hint"><AlertTriangle size={14} /> <span>{t.runtimeEventsHint}</span></div>
              <div className="event-list">
                {groupedEvents.length === 0 ? <p className="muted">{t.noEvents}</p> : groupedEvents.map((event, index) => (
                  <article key={`${event.message}-${event.level}-${index}`} className="event-card">
                    <strong className={event.level === "error" ? "error" : event.level === "warning" ? "warning" : ""}>{event.level}</strong>
                    <p>{event.message}</p>
                    <small>
                      {new Date(event.lastTimestamp).toLocaleTimeString()}
                      {event.count > 1 ? ` · ${event.count}x` : ""}
                      {event.screenIds.length > 0 ? ` · ${event.screenIds.join(", ")}` : ""}
                    </small>
                  </article>
                ))}
              </div>
            </div>

            <div className="section-gap">
              <LogPanel status={crawlStatus} t={t} />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function LogPanel({ status, t }: { status: CrawlStatus; t: typeof copy.en }) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [status.logs, status.running, status.stopping]);

  return (
    <section className="log-panel">
      <div className="job-meta">
        <span>{status.stopping ? t.stopping : status.running ? t.running : t.idle}</span>
        {status.exitCode !== undefined ? <span>Exit {status.exitCode}</span> : null}
        {status.startedAt ? <span>{new Date(status.startedAt).toLocaleTimeString()}</span> : null}
      </div>
      <pre ref={logRef} aria-live="polite">{status.logs.length > 0 ? status.logs.join("\n") : t.logsEmpty}</pre>
    </section>
  );
}

function SummaryFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="summary-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; foot: string; tone?: "bad" | "warn" }) {
  return (
    <article className={`metric-card ${tone ?? ""}`}>
      <header>{icon}<span>{label}</span></header>
      <strong>{value}</strong>
      <p className="metric-foot">{foot}</p>
    </article>
  );
}

function normalizeReport(report: Partial<Report>): Report {
  const findings = report.findings ?? [];
  const events = report.events ?? [];
  const screens = (report.screens ?? []).map((screen) => ({
    ...screen,
    signature: screen.signature ?? "",
    sourceFile: normalizeArtifactPath(screen.sourceFile),
    screenshotFile: normalizeArtifactPath(screen.screenshotFile),
    tapTargets: screen.tapTargets ?? [],
  })) as ScreenReport[];

  return {
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    platform: report.platform ?? "ios",
    summary: {
      screensVisited: report.summary?.screensVisited ?? screens.length,
      findings: report.summary?.findings ?? findings.length,
      errors: report.summary?.errors ?? findings.filter((finding) => finding.severity === "error").length,
      warnings: report.summary?.warnings ?? findings.filter((finding) => finding.severity === "warning").length,
      runtimeErrors: report.summary?.runtimeErrors ?? events.filter((event) => event.level === "error").length,
      events: report.summary?.events ?? events.length,
      completed: report.summary?.completed ?? true,
    },
    screens,
    findings,
    events,
  };
}

function groupRunEvents(events: RunEvent[]): GroupedRunEvent[] {
  const groups = new Map<string, GroupedRunEvent>();

  for (const event of events) {
    const key = `${event.level}:${event.message}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...event,
        count: 1,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
        screenIds: event.screenId ? [event.screenId] : [],
      });
      continue;
    }

    existing.count += 1;
    existing.lastTimestamp = event.timestamp;
    if (event.screenId && !existing.screenIds.includes(event.screenId)) {
      existing.screenIds.push(event.screenId);
    }
  }

  return [...groups.values()].sort((a, b) => new Date(a.lastTimestamp).getTime() - new Date(b.lastTimestamp).getTime());
}

function createPendingReport(startedAt?: string): Report {
  return {
    generatedAt: startedAt ?? new Date().toISOString(),
    platform: "ios",
    summary: {
      screensVisited: 0,
      findings: 0,
      errors: 0,
      warnings: 0,
      runtimeErrors: 0,
      events: 0,
      completed: false,
    },
    screens: [],
    findings: [],
    events: [],
  };
}

function findingTitle(finding: Finding): string {
  const label = finding.element.label?.trim();
  if (label) {
    return `${finding.rule}: ${label}`;
  }

  return `${finding.rule}: ${finding.element.type}`;
}

function formatBounds(bounds: { x: number; y: number; width: number; height: number }): string {
  return `${Math.round(bounds.width)}x${Math.round(bounds.height)} at ${Math.round(bounds.x)},${Math.round(bounds.y)}`;
}

function normalizeArtifactPath(path: string): string {
  const marker = "/reports/";
  const markerIndex = path.indexOf(marker);
  if (markerIndex >= 0) {
    const reportRelativePath = path.slice(markerIndex + marker.length);
    const [, ...artifactParts] = reportRelativePath.split("/");
    return artifactParts.join("/");
  }
  return path;
}

function formatRunDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatRunSummary(summary?: RunSummary): string {
  if (!summary) return "No summary";
  return `${summary.screensVisited ?? 0} screens · ${summary.errors ?? 0} errors · ${summary.warnings ?? 0} warnings`;
}

function isPlaceholderBundleId(bundleId: string): boolean {
  return ["com.yourcompany.yourexpoapp", "com.example.app"].includes(bundleId.trim().toLowerCase());
}
