# AGENTS.md

## Project Goal

Build an open-source, self-hosted accessibility crawler for Expo and React Native apps. The tool should automate simulator/emulator exploration, produce deterministic accessibility reports, and present results in a local web dashboard.

Public repository: `ardasnturk/react-native-accessibility-automation`

The project is local-first by design: app builds, screenshots, XML source, crawler logs, and reports should stay on the developer machine unless the user explicitly exports or publishes them.

## Architecture

- `src/index.ts`: crawler entrypoint, Appium/WebdriverIO session management, UI tree parsing, accessibility checks, screenshots, and report generation.
- `src/server-state.ts`: shared server-side helpers for config, report discovery, crawl process management, and artifact streaming.
- `app/`: Next.js App Router landing page, dashboard, and API routes.
- `reports/`: generated crawl artifacts. Do not commit generated report output.
- `a11y-crawler.config.example.json`: public example config.
- `a11y-crawler.config.json`: local config. This file is ignored by git.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, and `.github/`: open-source community and release files.

## Development Rules

- Use Yarn, not npm.
- Keep all public documentation in English.
- Keep `README.md` focused on user setup and operation. Keep `AGENTS.md` focused on maintainers and coding agents.
- Keep community files concise and practical. Avoid adding process that the project does not actually follow.
- Prefer bounded crawling over open-ended recursion. Every navigation strategy must have clear limits.
- Never add destructive UI actions to default examples.
- Treat `testID` as an automation selector only. Accessibility findings must evaluate labels, roles, text, content descriptions, traits, target size, and related assistive metadata.
- Runtime failures should be recorded in `report.json` whenever possible instead of crashing without output.
- Keep the dashboard local-first and self-hosted. Do not introduce a hosted dependency without a clear opt-in design.
- Crawler events are operational diagnostics, not accessibility findings. Keep the UI copy clear about that distinction.

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

## Release Checklist

For a public release:

1. Confirm `package.json` has the intended version.
2. Run `yarn tsc --noEmit`.
3. Run `yarn build`.
4. Update `README.md` if user-facing behavior changed.
5. Commit the release changes.
6. Create a git tag using the `vX.Y.Z` format.
7. Push the branch and tag.
8. Create a GitHub release with concise release notes.

## UI Guidance

The dashboard is an operational tool. Keep it dense, readable, and predictable. Prioritize fast scanning of screens, findings, runtime events, and screenshots over marketing-style presentation.
