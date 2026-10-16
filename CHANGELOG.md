# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: a minor bump may break).

## [Unreleased]

## [0.2.3]

### Changed

- Verified against DeepSeek Harness 0.2.1-alpha.4 (install smoke test and the 24-check browser E2E pass with no code changes). It is now in `TESTED_DSH_VERSIONS`.
- Redesigned both READMEs with animated SVG illustrations (hero, agent routing, widget streaming, security model), a highlights grid, badges, a compatibility table and collapsible sections. `npm run docs:art` regenerates the illustrations.

## [0.2.2]

### Fixed

- npm co-installation with the supported DSH 0.2.0-rc and 0.2.1-alpha lines now uses explicit prerelease peer ranges.
- README installation examples use the 0.2.2 release version, explain the optional `next` tag, and link to versioned documentation and media outside the tarball.

### Changed

- Release reruns verify registry integrity, exact package contents and provenance before reusing a version. GitHub Release assets come from that registry tarball and conflicting assets are refused.
- Release preflight requires the tagged commit to belong to main. Actions use immutable commit SHAs, and publishing can opt into npm Trusted Publishing after account-side setup.

## [0.2.1]

### Changed

- Rebuilt the client bundle with esbuild 0.28 and idiomorph 0.8 (widget DOM morphing). The catalog sources also type-check against React 19 types.
- CI and release workflows use `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7` and `pnpm/action-setup@v6`. Browser E2E runs in isolated workspaces and cleans up its processes reliably.

### Fixed

- Real-model evaluation now reads `DEEPSEEK_API_KEY` from the environment, validates requested rendered components and multi-turn data, acknowledges all tool calls, and exits nonzero on failures. Partial runs no longer combine historical results under a new timestamp. API errors and missing messages fail clearly; requests have a timeout.
- Marked the legacy evaluation report's missing-Chart false positive and clarified the limits of API-only evaluation in both READMEs.

## 0.2.0 (development milestone)

### Changed

- **Renamed the npm package to `deepseek-harness-intelligent-ui`** (`dsh-intelligent-ui` belongs to an unrelated project on npm). The bundle row id stays `intelligent-ui`, so existing `cordis.patch.yml` overrides keep working. Remove the old `file:` install with `dsh plugin --profile web remove dsh-intelligent-ui` before installing this one.
- **Supports DeepSeek Harness `>=0.1.7-rc.1 <0.3.0`** instead of only `0.2.0-rc.1`, which DSH refused to install on `0.2.0-rc.2` and later. The peers are marked optional because DSH provides them, so pnpm no longer warns about "missing peers".

### Added

- Live streaming previews on DSH 0.2.1+. DSH 0.2.1 removed the `useToolCallArgumentsPartial` hook that tool views used to receive the streamed arguments. The views now fall back to the call's growing `args` view, so catalog UIs and widgets still render progressively and still survive a stopped generation.
- One-command install from npm: `dsh plugin --profile web add deepseek-harness-intelligent-ui`.
- `npx deepseek-harness-intelligent-ui install | uninstall | doctor`: checks Node, dsh (and that its version is supported), pnpm and the profile, then runs DSH's own plugin manager.
- Cross-platform E2E (Windows, Linux, macOS). It also waits for DSH 0.1.x's delayed first-run notice.
  - Chrome is detected per platform, process cleanup works on POSIX, and `--spec` installs a packed tarball or a registry version.
- GitHub Actions:
  - CI on 3 OSes × Node 22.13/24.
  - A nightly compatibility matrix across DSH versions (install smoke test plus browser E2E).
  - A tag-driven release that publishes to npm with provenance and creates the GitHub Release.

## 0.1.0 (development milestone)

### Added

- Initial release:
  - The declarative component catalog (`ui_render`) and sandboxed streaming HTML widgets (`ui_render_widget`).
  - The `/ui` command and the guidance system-prompt section.

[Unreleased]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/releases/tag/v0.2.1
