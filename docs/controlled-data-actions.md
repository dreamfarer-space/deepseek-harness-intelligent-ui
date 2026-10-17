# Controlled data and actions

`dataRef` and action Buttons are opt-in capabilities for trusted host adapters. Existing inline Table/Chart data, prompt Buttons, Forms, `Bridge.sendPrompt` and `Bridge.openLink` retain their contracts. Without an adapter, bound components and action Buttons show an unavailable error; no tool is selected by name automatically.

## Runnable example

From the repository root:

```sh
npm run build
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/examples/controlled-dashboard.html`. The example reads JSON once, registers it once, and uses the same `dataRef` in Table and Chart. Search, exact column filtering and ascending/descending sort update both locally. Table pagination does not truncate Chart data. Export downloads the filtered/sorted rows as CSV. Retry is a simulated write with a native confirmation and refreshes the registered dataset. It does not call GitHub or a model. A prompt Button still demonstrates the original host callback.

After building, `npm run e2e:controlled` checks real Chromium clicks, parent approval, repeated filtered exports, cancellation recovery and uncertain-write deduplication. It starts its own loopback server; set `CHROME_PATH` if Chrome is not installed in a standard location. The compatibility CI runs this alongside the existing browser suite.

## Host contract

```js
import { createControlledRuntime } from 'deepseek-harness-intelligent-ui/controlled';
const runtime = createControlledRuntime(sessionId); // one instance per authenticated live session
const release = runtime.registerData(uiId, 'checks', { columns: ['Name', 'Count'], rows: [['build', 8]] });
const ref = { id: 'checks', scope: uiId };
// Table props: { dataRef: ref, pageSize: 20 }
// Chart props: { kind: 'bar', dataRef: ref, labelColumn: 0, valueColumns: [1] }
```

The host supplies `sessionId`, the rendered surface supplies its `uiId`/call id. A generated `dataRef.scope` must match that surface exactly. References cannot name another conversation or UI. No property paths, evaluation, URLs, arbitrary JS or arbitrary tools are supported. Data is cloned and deeply frozen; rows contain only finite JSON scalars. Local query state is shared per registered reference, scoped to the same session/UI. Numeric chart columns are checked before rendering; invalid/missing/revoked data renders an error.

Register actions from trusted code only:

```js
runtime.registerAction(uiId, 'retryCheck', {
  schema: {
    type: 'object', properties: { check: { type: 'string', enum: ['build', 'unit'] } },
    required: ['check'], additionalProperties: false,
  },
  effect: 'write', // required: 'read' or 'write'
  authorize: async (ctx, args) => backendPermissionCheck(ctx, args),
  confirm: async (ctx, args) => existingHostApprovalFlow(ctx, args),
  run: async (args, ctx) => authorizedBackendRetry(args, { idempotencyKey: ctx.requestId }),
});
// Button props: { label: 'Retry', action: { actionId: 'retryCheck', args: { check: 'build' } } }
```

Every action needs an explicit native trusted click and host `authorize` returning exactly `true`. Writes additionally require host `confirm` returning exactly `true`; missing approval callbacks fail registration. Permission is rechecked after confirmation, and revocation/disposal is checked before execution. The host's authorized backend must enforce credentials, target/resource permissions, approval and durable idempotency too. Browser checks do not replace server authorization. The registry/callbacks/credentials must never be passed into widget definitions, postMessages, model arguments or untrusted JavaScript.

The supported JSON Schema subset is `object` (`properties`, `required`, `additionalProperties:false`), `array` (`items`, `maxItems`), `string` (`maxLength`, primitive `enum`), `number`/`integer` (`minimum`, `maximum`, primitive `enum`), `boolean`, and `null`. Other keywords fail closed. Required/unknown fields, finite numbers, integer values and nesting are validated without coercion. Set narrow enums and bounds appropriate to the backend.

## DSH and portable renderer integration

Portable hosts pass `{sessionId, controlled: runtime, sendPrompt}` to `mount`. Both `createControlledRuntime` and `mount` are exported by the standalone renderer bundle. An existing remote client must opt into this contract in its trusted host adapter; upgrading this plugin alone does not add a server endpoint to another project.

A trusted DSH **browser companion plugin** may provide this optional Cordis service before rendering surfaces:

```js
ctx.provide('intelligentUiControlled', {
  forSession: sessionId => authenticatedSessionRuntimes.get(sessionId),
});
```

The main client resolves it for the actual conversation and forwards it to render, patch, and widget views. The registry is also exported by the client module for companion code. Providers own session lifecycle and disposal; do not use a shared singleton for different sessions. They should publish only the permitted resource/action ids to the model. No provider is required for existing functionality.

## Widget bridge

`Bridge.readData({id,scope})` returns a cloned read-only dataset. `Bridge.invokeAction({actionId,args,requestId?})` returns a Promise of the bounded JSON result or rejects with an error. The `Websandbox.connection.remote` alias supports the same additions. The normal bridge rejects invocations on mount, timers, and synthetic clicks. Generated code must call it synchronously from an actual click handler.

A sandbox can tamper with its own bootstrap. Therefore **the parent never treats an iframe gesture flag as authority**: even a raw RPC only stages a bounded, validated request in a native parent panel showing the exact action and arguments. The user must click “Run action” outside the iframe before any action executes, including reads. Writes then go through the host's own approval flow as well. The panel is limited to one pending request; cancel rejects the Promise. Frame source and token checks are preserved. Never embed a `controlled` registry into an iframe.

## Receipts, lifetime and privacy

Action Buttons and widget Promises expose loading/success/error states. Native Buttons share one receipt while an operation is pending; after success, the next deliberate click allocates a new request id (for example, exporting again after changing a filter). Widget adapters can supply a stable `requestId`; the same id/args shares an in-flight/success/execution-error receipt. Reuse with different args is rejected. Permission or approval failures before `run` starts release the receipt, so another explicit click can request permission/confirmation again. Once `run` starts, errors remain cached because the backend might already have applied a write before a transport error; native Buttons retain that request id on failure. An uncertain write must not be retried using a fresh key without checking the backend. Remounts, process restarts and scope disposal require backend idempotency; browser memory is not durable exactly-once delivery.

Defaults per session: 64 resources; 512 KB and 500 rows × 24 columns per dataset; 16 KB per request; 64 KB per result; 128 receipts; JSON depth 20 and schema depth 12. At capacity new requests fail closed; completed receipts are not silently evicted. For updated data, call its registration disposer and register the replacement under the same id. Consumers subscribe to changes. Data and query state survive ordinary UI patch versions and inline/turn-tail remounts while the host registry lives.

`releaseScope(uiId)` removes that surface's data, actions and receipts; `dispose()` invalidates the session and releases all resources. Providers must call these when the UI/session is permanently closed, permissions change or the plugin is unloaded. Unregistering while permission/approval is pending prevents execution. An already running external operation cannot be undone by UI disposal; backend lifecycle handling remains the host's responsibility.

Registry datasets, queries, execution argument/result copies and receipts are memory-only. Action arguments included by the model in a UI definition remain subject to the host conversation/history policy; keep secrets out of definitions. Controlled surfaces also skip the interrupted-argument localStorage stash. Controlled Widget surfaces disable all existing widget state persistence, so copying a fetched dataset into `UI.state` cannot spill it into localStorage. Existing non-controlled widgets retain their original persistence behavior. Refresh loses registrations and yields an unavailable state until the authenticated host reloads them; resources are never restored from model history or localStorage.
