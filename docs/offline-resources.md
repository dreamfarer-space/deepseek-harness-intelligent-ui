# Optional offline resources

The normal npm package uses the existing CDN allowlist. `npm run build:offline`
produces a separate, opt-in **browser-resource** tarball with both the DSH Web
client and the portable renderer. It does not change the committed online bundles,
publish to npm, or require a server endpoint.

## Build and install

On a connected build machine, from the desired reviewed commit:

```sh
npm ci --no-audit --no-fund
npm run build:offline
npm run verify:offline
npm run e2e:offline
```

The output is `dist/offline/deepseek-harness-intelligent-ui-<version>-offline.tgz`,
a matching `.sha256` file, and `size-report.json`. The CI `offline resources`
job builds, verifies and browser-tests the same tarball, then uploads these files.
The normal npm package never includes this larger artifact. No new npm package or
version is published by this command.

Check the archive hash before transferring/installing (PowerShell:
`Get-FileHash -Algorithm SHA256 <archive>`; Linux: `sha256sum -c <archive>.sha256`).
Then use DSH's existing local-package installation path, with an absolute path:

```sh
dsh plugin --profile web add file:/absolute/path/deepseek-harness-intelligent-ui-<version>-offline.tgz
```

This replaces the online variant of the same plugin; install one variant per
profile. Restart DSH Web and reload the page after switching. The CLI's default
registry spec still installs the online package. For a portable/WebView host,
copy `package/renderer/renderer.js` from the extracted offline tarball instead of
the normal renderer, and keep `offline-resources/` for audit. The mounting API is
unchanged; `DshIntelligentUiRenderer.resourceMode` reports `offline` or `online`.

“Offline” describes **browser rendering resources**. DSH itself, Node dependencies
and installation tools must already be available or cached on an air-gapped
machine. This tarball does not provide an offline LLM, bundle DSH, or vendor the
plugin's Node runtime dependencies.

## Capability and resource inventory

All sizes below are approximate uncompressed resource sizes from the current
build; `size-report.json` records exact bytes and individual gzip sizes.

| Resource | Locked version | Offline capability | Approx. bytes |
| --- | --- | --- | ---: |
| KaTeX | 0.16.11 | Math rendering, embedded WOFF2 fonts | 264,000 JS + 367,000 CSS/fonts |
| Mermaid | 11.4.1 | Built-in diagrams, bundled lazy chunks and transitive dependencies | 2,612,000 |
| Three.js | 0.169.0 | `three` and `three/addons/controls/OrbitControls.js`; `UI.three` | 699,000 |
| D3 | 7.9.0 | `import('d3')` | 283,000 |
| Chart.js | 4.4.4 | `import('chart.js/auto')` | 203,000 |
| canvas-confetti | 1.9.3 | `import('canvas-confetti')` | 11,000 |
| GSAP | Online alias: 3.12.5 | Not included in the offline pack | — |

The current tarball is about **3.2 MB packed / 9.8 MB unpacked**, compared with
about **225 KB** for the online package. CI fails above **5 MB packed / 16 MB
unpacked** for the offline variant and preserves the existing **1 MB** normal
package budget. The offline strings are embedded separately in each browser
entry point; Math/Mermaid frames copy only the module they require.

Only the exact imports listed above are provided offline. Other Three.js addons,
GLTF/model/texture downloads, external icon packs, CDN URLs, external fonts,
GSAP, fetch/XHR/WebSocket, and remotely loaded media are unsupported. Use
procedural geometry, canvas, SVG or inline data assets. Unsupported imports cause
widget script errors visible through the existing widget error UI. Math/Mermaid
loading or rendering failures show the source **and an explicit “Static fallback”
status**. Native catalog charts/tables/Plot and `UI.canvas` do not need this pack.

The offline Host advertises the supported subset to the model and emits an empty
CDN list with network disabled. A replayed older online policy cannot reopen
network access in the offline bundle. Switching back to the online bundle keeps
persisted policy constraints: artifacts created with an empty CDN policy remain
static until regenerated with an online policy.

## Sandbox and integrity

Third-party code runs only in `sandbox="allow-scripts allow-forms"` frames.
The trusted build embeds complete module text. The frame creates Blob modules
and an exact importmap inside its own opaque origin. No `allow-same-origin`,
host-origin asset URL, service worker, arbitrary path broker or additional
network origin is added. Offline CSP removes CDN origins even if stored policy
sets `allowNetwork: true`; `connect-src` stays `'none'`. Fonts are inline data.
The existing token-checked bridge remains the only host communication channel.

The tarball contains `offline-resources/manifest.json` with:

- The SHA-256 of the source `package-lock.json` and exact top-level versions.
- Resource text sizes, gzip sizes, SHA-256 values and provided import names.
- Bundled transitive package versions and lockfile integrity values.
- SHA-256 and byte counts for shipped runtime files and upstream license files.

Complete upstream license/notice files and package declarations live under
`offline-resources/licenses/`. Builds fail if an input is unpinned, absent from
the lockfile, lacks a license file, or leaves a module import unresolved.
Verify an extracted archive with this checkout's standalone Node helper:

```sh
node scripts/offline/verify.mjs /absolute/path/to/extracted/package
```

Checksums detect corruption or differences from the supplied manifest. They do
not authenticate an untrusted archive/manifest; obtain both from a trusted build
or reviewed CI run. Rebuilding the same lockfile uses deterministic resource
inputs; archive bytes can differ across npm/Node versions, so record the checksum
of the artifact actually distributed.

## Refresh and regression tests

Update exact versions in `package.json` and `scripts/offline/build.mjs` together;
update the online CDN aliases if intended. Regenerate and commit `package-lock.json`
and both normal browser bundles. Then rebuild the offline artifact and review
its manifest, license changes and size report before distributing it. Existing
installations never refresh resources automatically.

`e2e:offline` extracts the actual tarball and verifies its checksums, deliberately
corrupts a bundle to assert rejection, disables the browser's network after the
local renderer loads, and renders Math/fonts, Mermaid and a procedural Three.js
scene. It checks the other supported imports, theme updates, host DOM/Cookie/
localStorage denial, CSP network denial and an unsupported addon. It then checks
the online renderer's explicit fallback while external requests are blocked.
Chrome must be installed, or set `CHROME_PATH` to a Chromium executable.
