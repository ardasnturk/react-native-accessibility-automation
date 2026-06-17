# React Native Accessibility Automation

React Native Accessibility Automation is a self-hosted accessibility crawler for Expo and React Native apps. It uses Appium to launch an app on an iOS Simulator or Android Emulator, explores reachable screens, audits visible interactive elements, captures screenshots, and presents results in a local responsive web dashboard.

The project is designed for teams that want repeatable local accessibility checks without sending app builds, screenshots, or crawler reports to a hosted service. It is currently focused on Expo Dev Client and iOS Simulator workflows, with Android support available through Appium UiAutomator2 configuration.

## Release Status

Current release: `0.1.0`

This first public release includes the TypeScript crawler, the self-hosted Next.js dashboard, simulator onboarding, report history, screenshots, XML artifacts, grouped crawler events, and English/Turkish UI support.

## License

This project is released under the [MIT License](LICENSE).

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- Use GitHub Issues for reproducible bugs and feature requests.
- Do not include sensitive app screenshots, XML output, or user data in public issues.

## Features

- Next.js App Router web app with a landing page and local dashboard.
- Modern SaaS-style command center with sidebar navigation, report history, live crawl logs, evidence preview, and responsive report review panes.
- Web-based onboarding for simulator device, installed iOS runtime, and Expo Dev Client bundle id.
- Start, stop, and monitor crawls from the web UI.
- Light and dark mode support.
- English and Turkish dashboard UI.
- Automatic Appium startup, simulator boot, and app launch through configurable bootstrap hooks.
- TypeScript crawler powered by Appium and WebdriverIO.
- Bounded crawling with max screen, depth, duration, app-ready, and per-screen action limits.
- Duplicate screen/action filtering to reduce repeated navigation loops.
- Native alert and blocking-overlay recovery attempts.
- Runtime event reporting for crawler errors, skipped actions, native alerts, and recovery attempts.
- Timestamped report runs under `reports/run-*`.
- Previous report list with date, summary, open, and delete actions.
- Screenshot, XML, JSON, and Markdown output for each run.
- Responsive dashboard for desktop, tablet, and mobile layouts.

## Requirements

- macOS with Xcode and iOS Simulator for iOS crawling.
- Node.js 20+.
- Yarn 1.x.
- An installed Expo Dev Client or EAS simulator build for the target app.

Install dependencies and Appium drivers:

```bash
yarn install
yarn appium driver install xcuitest
yarn appium driver install uiautomator2
```

## Quick Start

Start the self-hosted dashboard:

```bash
yarn start
```

Open:

```text
http://127.0.0.1:4174
```

The landing page is available at `/`. Open `/dashboard` to configure and run crawls. On first dashboard launch, the app asks for:

- simulator device
- installed iOS runtime
- Expo Dev Client bundle id
- optional Expo server startup settings

Click **Continue** to save the local config. Then click **Start Crawl**. The server starts the crawl command, Appium starts when needed, the simulator boots, the app launches, and logs stream into the dashboard.

Use **Stop** to terminate a long crawl. The server first sends `SIGINT`, then escalates to `SIGTERM` and `SIGKILL` if the process tree does not stop.

## Dashboard Workflow

The dashboard opens to a report history page, not directly to the last report. Use the toolbar to switch language, change theme, refresh local state, or reopen settings.

- **Command Center** shows run state, setup actions, and primary crawl controls.
- **Start Crawl** starts a new timestamped run.
- **Previous Reports** lists saved runs by date.
- **Open** opens a selected report.
- **Delete** removes a saved report run.
- **Settings** reopens simulator/device/bundle id configuration.
- **Start Expo server before crawling** starts the configured Expo command before Appium opens the app.
- **Refresh** reloads status, reports, and logs.

Each report view includes:

- summary cards for screens, errors, warnings, and completion status
- visited screens
- screenshots
- XML source links
- accessibility findings
- runtime events
- crawl job logs
- summary metrics

## Report Output

Web-started crawls write each run to a timestamped directory:

```text
reports/run-2026-06-17T15-58-25-163Z/report.json
reports/run-2026-06-17T15-58-25-163Z/report.md
reports/run-2026-06-17T15-58-25-163Z/screen-001.png
reports/run-2026-06-17T15-58-25-163Z/screen-001.xml
```

Manual crawls use the configured output directory unless `REPORT_OUTPUT_DIR` is provided.

```bash
REPORT_OUTPUT_DIR=reports/my-run yarn a11y:crawl
```

## Configuration

The web UI writes local settings to:

```text
a11y-crawler.config.json
```

This file is intentionally ignored by git. If it does not exist, the server falls back to `a11y-crawler.config.example.json` and then to built-in defaults.

For iOS with an installed Expo Dev Client, the important capabilities are:

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "iPhone 17 Pro",
  "appium:platformVersion": "26.5",
  "appium:bundleId": "com.yourcompany.yourexpoapp",
  "appium:noReset": true,
  "appium:autoAcceptAlerts": true,
  "appium:newCommandTimeout": 300,
  "appium:waitForIdleTimeout": 2,
  "appium:reduceMotion": true
}
```

For an EAS simulator build artifact, you can use an `.app` path instead of `bundleId`:

```json
{
  "appium:app": "/absolute/path/to/YourExpoApp.app",
  "appium:noReset": true
}
```

Android support is available through UiAutomator2, but the current web onboarding focuses on iOS simulator selection:

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "Pixel_8",
  "appium:appPackage": "com.yourcompany.yourexpoapp",
  "appium:appActivity": ".MainActivity",
  "appium:noReset": true,
  "appium:autoGrantPermissions": true,
  "appium:newCommandTimeout": 300
}
```

## Bootstrap Hooks

The `bootstrap` section controls local dependency startup:

```json
{
  "bootstrap": {
    "startAppium": true,
    "appiumCommand": "yarn appium:server",
    "startSimulator": true,
    "simulatorName": "iPhone 17 Pro",
    "startExpo": false,
    "expoCommand": "yarn expo start --dev-client",
    "expoCwd": "../your-expo-app",
    "startupTimeoutMs": 90000
  }
}
```

Expo startup remains project-specific. For the most reliable automation, install an Expo Dev Client or EAS simulator build first and use `bundleId`.

To let the web UI start Expo automatically, enable **Start Expo server before crawling** in Settings and set:

- `Expo Project Path`: path to the Expo app directory, for example `../my-expo-app`
- `Expo Command`: command to run inside that directory, for example `yarn expo start --dev-client`

## Crawl Controls

Useful controls in `a11y-crawler.config.json`:

- `maxDepth`: maximum navigation depth.
- `maxScreens`: maximum unique screens to save.
- `maxDurationMs`: hard crawl duration limit.
- `appReadyTimeoutMs`: how long to wait for splash/update/loading screens to finish.
- `maxActionsPerScreen`: maximum tap attempts per screen.
- `maxTapTargetsPerScreen`: maximum detected targets stored per screen.
- `tapTimeoutMs`: per-element tap wait timeout.
- `settleMs`: delay after navigation/tap actions.
- `denyLabels`: case-insensitive label fragments that must not be tapped.
- `denyPatterns`: regular expressions for elements that must not be tapped.
- `seedActions`: optional startup actions, such as dismissing onboarding.

## React Native Accessibility Pattern

Use `testID` for automation and accessibility props for assistive technology.

```tsx
<Pressable
  testID="settingsButton"
  accessible
  accessibilityRole="button"
  accessibilityLabel="Settings"
>
  <Text>Settings</Text>
</Pressable>
```

`testID` helps the crawler find the element. It does not provide a meaningful screen reader name by itself.

## Project Scripts

Use the web dashboard for normal operation. The CLI scripts are still available for local debugging and automation.

| Script | Purpose |
| ------ | ------- |
| `yarn start` | Build and start the self-hosted Next.js dashboard on `127.0.0.1:4174`. |
| `yarn dev` | Start the Next.js development server. |
| `yarn a11y:crawl` | Run the crawler directly with `a11y-crawler.config.json`. |
| `yarn appium:server` | Start Appium with relaxed security for local automation. |
| `yarn build` | Build the Next.js app. |

## Manual CLI Usage

Start Appium manually:

```bash
yarn appium:server
```

Run the crawler directly:

```bash
yarn a11y:crawl
```

## Development

Run the Next.js development server:

```bash
yarn dev
```

Open:

```text
http://127.0.0.1:4174
```

Before committing changes:

```bash
yarn tsc --noEmit
yarn build
```

The project intentionally keeps the crawler, Next.js API routes, and dashboard in one package while the API is still small. Split packages only when public extension points become stable.

## Limitations

This is a black-box crawler. It can explore screens reachable through visible UI elements, but it cannot guarantee full app coverage without app-specific guidance. Authentication, destructive actions, payment flows, feature flags, deep links, remote data state, and custom gestures should be modeled with seed actions, deny lists, or future app-specific plugins.
