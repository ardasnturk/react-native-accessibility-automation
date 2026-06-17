# Contributing

Thanks for your interest in improving React Native Accessibility Automation.

This project is an early-stage, local-first accessibility automation tool for Expo and React Native apps. Contributions are welcome when they keep the crawler predictable, the reports understandable, and the dashboard useful for repeated QA work.

## Development Setup

```bash
yarn install
yarn appium driver install xcuitest
yarn appium driver install uiautomator2
```

Run the dashboard:

```bash
yarn dev
```

Run verification before opening a pull request:

```bash
yarn tsc --noEmit
yarn build
```

## Contribution Guidelines

- Use Yarn, not npm.
- Keep public documentation in English.
- Keep crawler behavior bounded with clear depth, screen, action, and duration limits.
- Do not add destructive default crawl actions.
- Treat crawler events as operational diagnostics, not accessibility findings.
- Prefer accessibility ids and stable native selectors over XPath.
- Keep generated reports, screenshots, local config files, and simulator artifacts out of git.

## Pull Requests

For pull requests, include:

- what changed
- why it changed
- how it was tested
- any known limitations

Small, focused pull requests are easier to review than broad rewrites.
