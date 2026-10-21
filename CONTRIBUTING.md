# Contributing to deepseek-harness-intelligent-ui

`deepseek-harness-intelligent-ui` is an MIT-licensed plugin for DeepSeek Harness (DSH), published to npm. It renders generative UI inside the chat: a declarative component catalog plus sandboxed streaming HTML widgets.

## Requirements and local setup

- Node.js >= 22.13.0 (CI also tests Node 24).
- npm for this repository's own scripts. DSH installs plugins with pnpm, which CI installs separately.

```bash
npm ci          # exactly the locked dependency tree CI uses
npm run build   # regenerate the committed browser bundles
npm test
npm run typecheck
```

- `npm run build` regenerates `client/client.js` and `renderer/renderer.js` from `client-src/` and `renderer-src/`.
- `npm test` runs Vitest, which currently discovers 35 test files under `tests/`.
- `npm run typecheck` runs `tsc -p tsconfig.json`.

## The bundle rule

`client/client.js` and `renderer/renderer.js` are generated but committed.

- After editing `client-src/`, `renderer-src/`, or a shared `src/` module that the browser entry points import (for example `src/catalog/catalog.js`), run `npm run build` and commit both bundles.
- CI fails with "Client/renderer bundle is stale" when the committed bundles differ from a fresh build.

## Other checks

- `npm run build:offline`, `npm run verify:offline`, `npm run e2e:offline`: build and verify the offline resource pack. See `docs/offline-resources.md` before changing the bundled libraries.
- `npm run e2e:all`: drives a real DSH Web UI in Chrome with a scripted mock model. Needs Chrome (`CHROME_PATH` overrides discovery), a `dsh` executable (`DSH_BIN` overrides it) and pnpm. CI runs it in the compatibility jobs.
- `npm run smoke -- --spec <tarball>`: installs a packed tarball into DSH; CI runs it on Linux, macOS and Windows.
- `npm run eval:real`: manual, opt-in evaluation against a paid model API. It never runs on pull requests.
- `npm run release:check`: validates release consistency (version, changelog section, bundles).

CI also runs `scripts/ci/check-pack.mjs`, which enforces the packed-package contents and a 1,000,000-byte size limit.

## Tests

- Files live in `tests/` and must match `tests/**/*.test.{js,ts,tsx}`.
- React client component tests generally use the `.client.test.tsx` suffix; the portable renderer has its own `tests/portable.renderer.test.tsx`.
- The default Vitest environment is Node. A test that needs a DOM opts in with `// @vitest-environment jsdom` at the top of the file.

## Code style

- No formatter or linter is configured. Match the file you are editing.
- Two-space indentation, single quotes, ESM only. Host `src/` JavaScript terminates statements with semicolons; ordinary TypeScript and TSX in `client-src/` and `renderer-src/` generally omits them.
- `client-src/` and `renderer-src/` are TypeScript and React. `src/` (tools, catalog, plugin) is plain ESM JavaScript.
- Code must work on Linux, macOS and Windows: no POSIX-only assumptions in scripts, and mind CRLF.
- Do not add `prepare` or `postinstall` scripts. DSH installs plugins with build scripts blocked, so installation has to stay build-free.
- Treat widget and component content as untrusted: render it as text or inside the existing sandbox, never execute it in the host, and never send it to a model implicitly.

## Commits and pull requests

- Conventional Commits are the house style: `type(scope): summary` in the imperative mood, one logical change per commit. Types in use: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`, `perf`. Nothing enforces this automatically.
- Keep a PR focused. Describe the problem and the resulting behaviour, list what you ran to verify it, and disclose anything you did not verify.
- Link an issue with `Closes #123` when the PR resolves one.
- Do not force-push a branch someone is reviewing, and never move or delete a release tag.
- `main` is protected: the repository rules reject direct pushes and require a pull request. Twelve status checks are required for merge.

## Required checks

Pull requests run a reduced matrix; the same names appear on every PR.

- Five `test · <os> · node <version>` jobs: Ubuntu and Windows on Node 22.13.0 and 24, macOS on Node 24.
- Seven `dsh` compatibility jobs: `0.1.7-rc.2`, `0.2.0-rc.1` and `latest` on Ubuntu, the same three on Windows, and `latest` on macOS.

`dsh next` and `dsh alpha` also run on Ubuntu and Windows but are allowed to fail; they are an early warning, not a merge gate. Nightly, manual and release runs expand to the full matrix.

When adding DSH support, keep `SUPPORTED_DSH_RANGE` and the `package.json` peer ranges aligned, and update `TESTED_DSH_VERSIONS` together with the CI matrix — see `docs/compatibility.md`.

## Documentation and translations

- Plugin metadata translations live in `locale/en.json` and `locale/zh.json`.
- Browser UI translations live in the `zh` and `en` dictionaries in `client-src/locales.ts`. The Chinese dictionary defines the key type; TypeScript checks the English one against it, so add keys to both.
- Keep `README.md` and `README.zh-CN.md` in sync, and add user-visible changes to `[Unreleased]` in `CHANGELOG.md` (Keep a Changelog).
- Deeper documentation lives in `docs/`.

## Automation on your PR

- A bot classifies new issues with existing labels and posts an advisory Chinese review on pull requests.
- It reads the diff through the GitHub API, never runs your code, and cannot approve, request changes or merge.
- Treat that review as a hint: a maintainer's review and the required checks decide the merge.

## Security

- Do not publish reproduction details in a public issue.
- This repository has GitHub private vulnerability reporting enabled: use **Security → Report a vulnerability** to reach the maintainer privately.

## Releases

- Maintainers only. `docs/releasing.md` is the authority on release integrity and npm Trusted Publishing.
- A release is a `v<version>` tag matching `package.json`, on a commit reachable from `main`. The tag run executes CI, publishes through npm Trusted Publishing, verifies the registry contents, provenance and signatures, smoke-tests the published package on all three operating systems, and creates the GitHub Release with the verified tarball.
- Never reuse or overwrite a published version.

## Licence

Contributions are accepted under the MIT licence (see `LICENSE`).
