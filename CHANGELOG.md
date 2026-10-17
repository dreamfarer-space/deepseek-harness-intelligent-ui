# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: a minor bump may break).

## [Unreleased]

### Added

- Optional offline browser-resource tarball (`npm run build:offline`) for Math/KaTeX fonts, Mermaid, Three.js/OrbitControls, D3, Chart.js and canvas-confetti ([#18](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/18)). Exact locked versions, upstream licenses, checksums, size budgets, Host capability guidance and network-isolated Chromium regressions. Default online installation stays compatible.
- Explicit static fallback status for unavailable Math/Mermaid libraries.

## [0.2.4]

### Added

- `ui_patch`: change a UI shown earlier in the conversation by component id (`setProps`, `replaceNode`, `insertChild`, `removeNode`) instead of re-sending the whole tree ([#14](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/14)). `ui_render` results now report the UI's `uiId` and version. Patches are atomic, revalidated as a whole tree, version-checked (`baseVersion`; stale patches are refused with the current version), and limited to UIs of the same conversation. The Host rebuilds versions by replaying the session history, so it keeps no state.
- Untouched components keep their interaction state across versions (table sort, tab, form input and submitted lock, Plot sliders). Streaming, refused, failed or stopped patches never replace the previous version; superseded copies collapse to a pointer; a reload restores the latest version.
- Browser E2E: a cross-turn patch scenario against real DSH Web (refusal and retry, in-place bar → line, state kept, reload).
- Real-model quality baseline ([#13](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/13)): `npm run eval:real` runs three separately reported layers: the scripted-model browser E2E, a real-model **API** stage, and a new real-model **browser** stage in real DSH Web + Chrome. It exits non-zero on any failure.
  - API stage: the model sees the plugin's real three tools (now including `ui_patch`) and system guidance. The tools' own `execute()` produces the tool results, so `ui_patch` edits are scored on the UI the user ends up with. Each case records tool choice, first-attempt schema validity versus recovery, and per-criterion checks of the rendered components and data. New cases: two successive chart edits (D3); D2 accepts an in-place patch.
  - Browser stage: plain text, multi-series chart (legend, Q1–Q4, hover), sortable table, form submit → follow-up using the submitted values, Plot sliders, Three.js (non-blank WebGL canvas, drag rotates), stop → regenerate, two in-place edits, Fast 3G with cache off, CDN unreachable, and phone width. Every case runs in a new conversation and records console errors.
  - Timings are recorded per stage: API time per model call, and in the browser first visible preview, complete generation and browser-side execution, each with p50/p95. `--repeat N` gives per-case success rates.
  - The report (`docs/real-model-eval-report.json` + `.md`) records date, model (requested, API-reported and fingerprint), prompt hash, assertion version, environment and failure reasons. It is redacted, and the run refuses to write a report that still contains the key.
  - A manually triggered `Real-model eval` workflow uses the `DEEPSEEK_API_KEY` secret.
- `scripts/eval/edit-demo.mjs` (`npm run eval:demo`) turns the browser-stage recording into a designed demo video, narrated by the DeepSeek whale girl in 26 poses from [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) (MIT). She switches poses with crossfades to fit each beat (hello, thinking at her laptop, an umbrella for the slow network, tears for a failure, confetti for a success), with motion on top. Each chapter is marked ✓/✗ and the narration follows the real outcome. Every frame is rendered deterministically.
  - The recorder marks non-content spans (new conversations, screenshots, viewport switches) to cut, and holds each case's result on screen for a few seconds.
  - Model waits are sped up; the recording's real-time stopwatch and a speed-factor sticker keep that visible.
- `scripts/eval/gallery.mjs` puts the README screenshots on one uniform 1200×750 canvas.
- Portable renderer for remote clients ([#22](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/22), experimental):
  - `renderer/renderer.js` is a prebuilt, host-neutral WebView bundle (`DshIntelligentUiRenderer.mount(element, host)`) that renders accepted `ui_render`, `ui_patch` and `ui_render_widget` artifacts without DSH Web. It ships in the npm package and is checked in CI and before release.
  - `deepseek-harness-intelligent-ui/portable` exports `projectNativeUiEvents`, which turns native Session events into artifacts.
  - Widget errors inside the sandbox are reported to the remote client.
  - See [docs/portable-renderer.md](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/portable-renderer.md).

### Fixed

- Browser E2E: the dark-theme check polls until the host card and the widget frame have both switched, instead of measuring after a fixed 1.2 s. The nightly `dsh latest · macos-latest` job had measured too early.

### Changed

- The guidance prefers `ui_patch` for changes to an existing `ui_render` UI; widgets are still re-rendered in full.
- `Form` fields added by a later version start at their defaults; a `Table` sort on a removed column is ignored.
- The 2026-10-10 real-model report (15/15, including the B3 false positive) moved to `docs/history/` as a labelled historical snapshot. A test now pins that the historical B3 answer fails.

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

[Unreleased]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/releases/tag/v0.2.1
