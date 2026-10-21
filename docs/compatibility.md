# Compatibility

## Supported versions

| Plugin | DeepSeek Harness (`@deepseek-ai/dsh`) | Node.js | OS |
|---|---|---|---|
| 0.2.x | `>=0.1.7-rc.1 <0.3.0` (0.1.7 – 0.2.x, prereleases included) | ≥ 22.13 | Windows, Linux, macOS |
| 0.1.0 | `0.2.0-rc.1` only (installed from a checkout as `dsh-intelligent-ui`) | ≥ 22.13 | Windows |

DSH enforces the range itself. Before it adds a plugin to a profile, its plugin manager checks the plugin's `@deepseek-ai/dsh*` `peerDependencies` against the running DSH (`evaluatePluginCompatibility`, prereleases included). A version outside the range is refused with `… is incompatible with dsh X`, and nothing is installed. `npx deepseek-harness-intelligent-ui doctor` reports the same result before you try.

The peers are marked optional in `peerDependenciesMeta` because DSH itself provides them. The ranges still gate the install, and pnpm no longer prints "missing peer" warnings.

## What is tested

Every push and pull request, and a nightly run (`.github/workflows/ci.yml`), cover:

- **Unit and component tests, typecheck, bundle freshness, package contents.** Matrix: Windows, Linux, macOS × Node 22.13 and 24. `tests/compat.test.js` runs DSH's real compatibility gate against `package.json` for every tested version, plus versions just outside the range.
- **Compatibility matrix.** Matrix: Windows, Linux, macOS × DSH `0.1.7-rc.2`, `0.2.0-rc.1`, `latest`, `next`, `alpha`. Each cell:
  1. installs that DSH globally;
  2. runs `npm pack`;
  3. runs `scripts/ci/smoke.mjs`, which installs the tarball with `dsh plugin add`, checks the version gate, profile manifest, bundle row (`--dump-config`) and shipped client bundle, then boots DSH Web and scans the log;
  4. runs the full browser E2E (`scripts/e2e/run-all.mjs --spec <tgz>`): 24 checks against real DSH Web with the scripted mock model.

  `latest`, `next` and `alpha` resolve at run time, so the nightly run catches new DSH releases. `next` and `alpha` cells are allowed to fail; they are an early warning, not a gate.

  macOS runners are scarce, so pull requests and pushes to `main` run macOS only on Node 24 and DSH `latest`. The nightly run, manual runs and the Release workflow run every cell.

Each release also installs the **published** package from npm on all three OSes (`.github/workflows/release.yml`).

### Local verification on Windows (2026-10-10, plugin 0.2.0 tarball)

| DSH | Install smoke test (8 checks) | Browser E2E (24 checks) |
|---|---|---|
| 0.1.7-rc.2 | pass | pass |
| 0.2.0-rc.1 | pass | pass |
| 0.2.0-rc.2 (`latest`) | pass | pass |
| 0.2.1-alpha.2 | pass | pass |
| 0.2.1-alpha.4 (re-verified 2026-10-15 with the 0.2.2 tarball) | pass (9 checks) | pass |

### Local verification on Windows (2026-10-17, plugin 0.2.4 + controlled/offline changes)

| DSH (cordis) | Install smoke test (9 checks) | Browser E2E (30 checks) |
|---|---|---|
| 0.2.1-alpha.5 (`alpha`, cordis 4.0.5) | pass | pass |
| 0.2.1-rc.2 (`next`, cordis 4.0.5) | pass | pass |

**Known API differences between DSH versions:**

- **0.1.x:** shows a first-run notice whose Continue button is enabled only after a delay. The E2E driver waits for it.
- **0.2.1-alpha:** dropped the `useToolCallArgumentsPartial` hook for tool views. Streaming previews now read the call's growing `block.args` view instead (`client-src/stream/args.ts`).

Linux and macOS results come from the GitHub Actions matrix.

## Adding a DSH version

1. Install it locally. To leave your global `dsh` alone, use a scratch prefix: `npm i -g --prefix /tmp/dsh-x @deepseek-ai/dsh@<v>`.
2. Run `DSH_BIN=/tmp/dsh-x/bin/dsh npm run smoke` and `DSH_BIN=… npm run e2e:all`.
3. If the version falls outside the range (for example 0.3.x), widen `SUPPORTED_DSH_RANGE` in `src/compat.js` and the matching `peerDependencies` in `package.json`. `tests/compat.test.js` fails until they agree.
4. Add the version to `TESTED_DSH_VERSIONS` in `src/compat.js` and to the `compat` matrix in `.github/workflows/ci.yml`.
5. If a DSH API changed, fix it with feature detection at the call site, not with version checks. Client slots are injected lazily (`ctx.slots.inject`), and the system-prompt section is optional.
6. Release a minor version.
