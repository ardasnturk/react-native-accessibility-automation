# AGENTS.md

## Project Goal

Build an open-source, self-hosted accessibility crawler for Expo and React Native apps. The tool should automate simulator/emulator exploration, produce deterministic accessibility reports, and present results in a local web dashboard.

## Architecture

- `src/index.ts`: crawler entrypoint, Appium/WebdriverIO session management, UI tree parsing, accessibility checks, screenshots, and report generation.
- `src/server-state.ts`: shared server-side helpers for config, report discovery, crawl process management, and artifact streaming.
- `app/`: Next.js App Router landing page, dashboard, and API routes.
- `reports/`: generated crawl artifacts. Do not commit generated report output.
- `a11y-crawler.config.example.json`: public example config.
- `a11y-crawler.config.json`: local config. This file is ignored by git.

## Development Rules

- Use Yarn, not npm.
- Keep all public documentation in English.
- Prefer bounded crawling over open-ended recursion. Every navigation strategy must have clear limits.
- Never add destructive UI actions to default examples.
- Treat `testID` as an automation selector only. Accessibility findings must evaluate labels, roles, text, content descriptions, traits, target size, and related assistive metadata.
- Runtime failures should be recorded in `report.json` whenever possible instead of crashing without output.
- Keep the dashboard local-first and self-hosted. Do not introduce a hosted dependency without a clear opt-in design.

## Verification

Before handing off changes, run:

```bash
yarn tsc --noEmit
yarn build
```

When crawler behavior changes, also run a local crawl against a simulator if available:

```bash
yarn appium:server
yarn a11y:crawl
```

## UI Guidance

The dashboard is an operational tool. Keep it dense, readable, and predictable. Prioritize fast scanning of screens, findings, runtime events, and screenshots over marketing-style presentation.
