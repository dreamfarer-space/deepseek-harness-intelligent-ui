# Trusted component extensions (Catalog API v1)

Install specialized declarative components without changing `CATALOG` or a rendering switch. The built-in 20 components and `ui_render_widget` are unchanged. Extension installation is a **trusted-code operation**, never a tool, JSON field, RPC, script URL, or model capability. Installed renderers run with the browser host's privileges; review them as you would a DSH plugin. Model output supplies only data that passes the installed schema.

## Run the example

From a source checkout:

```sh
npm ci
npm run build
node examples/component-extension/serve.mjs
```

Open <http://127.0.0.1:3286>. The `GitDiffViewer` uses an expandable diff, colored additions/deletions, and an explicit “Explain this diff” button. Disable/uninstall/reinstall it while mounted to observe the fallback. No API key, model, CDN, or core source edits are needed.

The example is included in the npm tarball. After installing a version containing this API, run:

```sh
node node_modules/deepseek-harness-intelligent-ui/examples/component-extension/serve.mjs
```

`manifest.js`, `renderers.js`, and `host.mjs` form a minimal template. The folder also includes a prebuilt DSH companion client, its build script, a Cordis patch and `package.template.json`. Keep the manifest in a shared package; install the exact same version on the Host and each browser client.

### Install the DSH companion template

Copy `examples/component-extension` to a directory outside the core checkout, rename `package.template.json` to `package.json`, and install your locally packed core build before building the companion:

```sh
# In the copied template folder:
cp package.template.json package.json
npm install /absolute/path/to/deepseek-harness-intelligent-ui-0.2.6.tgz
npm run build
# In DSH, with the same core tarball already installed:
dsh plugin add /absolute/path/to/copied-template
```

Restart DSH Web so the companion's browser dependency is composed. The Host plugin and browser factory both register `example.git/GitDiffViewer`; ask `/ui show a GitDiffViewer with this diff: ...`. The browser factory imports the core module through DSH's module loader, so it shares the core renderer registry. If you rename the companion, update the package name, Cordis patch name and build script module ID together. On Windows, copy/rename the file with your shell or Explorer.

## Host registration

```js
import { registerCatalogExtension } from 'deepseek-harness-intelligent-ui/catalog';
import { manifest } from './manifest.js';
export const name = 'my-components';
export function apply(ctx) {
  ctx.effect(() => {
    const extension = registerCatalogExtension(manifest);
    return () => extension.dispose();
  });
}
```

Registration belongs to this installed module instance, across its sessions. Do not create manifests from conversation data. Keep one core package installation shared by companion plugins (use a peer dependency); bundling a private copy creates an independent registry. Host registration contains only schemas and descriptions, never browser renderer source. Tools use getters to project the current catalog each turn, and execution, patch replay and native-event projection validate against that same catalog. Changes during an in-flight call are checked again at execution; callers may need to retry after a disable or uninstall.

## Browser registration

A **DSH companion client** imports `registerComponentExtension` from `deepseek-harness-intelligent-ui/client` and calls it inside `ctx.effect`, returning `extension.dispose`. Do not bundle that import: declare the core plugin in `dsh.client.inject` and `dsh.client.external` and resolve the import to its existing module-loader ID `deepseek-harness-intelligent-ui` (the core build's public client exports). React and its JSX runtime also remain external when a companion uses React directly. This is the same shared-client-module convention used by DSH platform plugins; importing/bundling `./catalog` in the browser creates a separate registry and will not install a renderer in the core client.

```js
import { registerComponentExtension } from 'deepseek-harness-intelligent-ui/client';
import { manifest } from './manifest.js';
import { renderers } from './renderers.js';
export function apply(ctx) {
  ctx.effect(() => {
    const extension = registerComponentExtension(manifest, renderers);
    return () => extension.dispose();
  });
}
```

For a **portable/WebView renderer**, install on the existing browser bundle:

```js
const api = window.DshIntelligentUiRenderer;
const extension = api.registerComponentExtension(manifest, renderers);
const surface = api.mount(element, { sendPrompt });
// On teardown: surface.dispose(); extension.dispose();
```

Browser registration is atomic: supply exactly one renderer function for each local component name. It registers the same manifest schema, then associates installed functions with its entries. No loading, `eval`, compilation or dynamic import is driven by model data. A host extension does not automatically distribute code to remote browsers; those browsers must independently install trusted renderers. Missing installations show safe errors.

## Manifest and type hints

```ts
import type { CatalogExtension, InferProps } from 'deepseek-harness-intelligent-ui/catalog';
const manifest = {
  apiVersion: 1,
  namespace: 'my.control',
  version: '1.0.0',
  components: [{
    name: 'RootLocusPlot', description: 'Display host-provided closed-loop poles.',
    propsSchema: {
      type: 'object', additionalProperties: false, required: ['gain'],
      properties: { gain: { type: 'number', minimum: 0, maximum: 100 } },
    },
    children: false,
    actions: [],
  }],
} as const satisfies CatalogExtension;
type Props = InferProps<typeof manifest.components[0]['propsSchema']>; // { gain: number }
```

`registerComponentExtension(manifest, { RootLocusPlot(context) { ... } })` infers `context.props` from the schema. Preserve literals with `as const`; JSON imports can also be checked against `CatalogExtension`. Both `/catalog` and `/client` include TypeScript declarations; browser consumers use their normal React types.

API v1 supports the strict bounded JSON Schema subset already used by controlled host actions:

- Objects: `type`, `properties`, optional `required`, **`additionalProperties: false`**.
- Arrays: `type`, `items`, optional `maxItems` (runtime default 1000).
- Strings: `type`, optional `maxLength` (runtime default 16000), `enum`.
- Numbers/integers: `type`, optional `minimum`, `maximum`, `enum`; finite numbers only.
- Booleans and null: `type`.

Unknown keywords/types, `$ref`, executable validators, and a prop named `children` are rejected. Use node-level `children` and declare `children: true` for containers. Maximums: 32 installed extensions, 32 components per extension, 64,000 manifest characters, schema depth 12. Namespaces match `[a-z][a-z0-9.-]{0,63}`; local names match `[A-Z][A-Za-z0-9]{0,63}`. Types are `namespace/Name`, so built-ins cannot be overwritten. Duplicate namespaces/types fail before installation, including disabled namespaces.

## Wire version and lifecycle

Extension nodes must include the exact installed release:

```json
{"id":"plot","type":"my.control/RootLocusPlot","componentVersion":"1.0.0","props":{"gain":2}}
```

`componentVersion` is distinct from the UI snapshot's numeric `version`. It is required for extension nodes in render, insert and replace operations; `setProps` keeps it. Built-in nodes omit it. API versions other than `1` fail registration. Releases use `major.minor.patch`; change the version whenever a schema or renderer changes, and never mutate a released version. Version skew fails closed instead of rendering with different semantics. Do not silently upgrade old persisted nodes: reinstall their exact trusted release or ask the model to create a new UI.

The returned handle has `setEnabled(boolean)` and idempotent `dispose()`. Disable removes all the extension's active types; enable restores them; dispose frees the namespace and unmounts its renderers. Calls after disposal cannot re-enable it, and stale handles cannot remove a replacement installation. Manifests are copied and deeply frozen on registration. Existing mounted views subscribe to changes, including the portable renderer. Unrelated extension registrations preserve component state.

## Renderer contract, interactions and fallback

The renderer receives `{ props, children, nodeId, streaming, stopped, h, sendPrompt, invokeAction }`. `h` is the core's shared `React.createElement`, so small renderers need no separate React runtime. Renderers are mounted as React component types and may use hooks with the shared React instance. Use ordinary React text children for untrusted strings, never `dangerouslySetInnerHTML` or executable prop strings.

Completed nodes stream through the same validation and renderer as settled/patch results. Partial nodes are not instantiated. `streaming` remains true for stopped previews, and `stopped` identifies an interruption. Disable controls while either is true; both interaction helpers also reject calls in those states and after unloading. Local computations and passive previews can remain visible when interrupted.

`sendPrompt(text)` follows the existing prompt policy and should be called only for explicit user actions. `invokeAction(actionId, args, nativeClickEvent, requestId?)` additionally requires the actionId in the component's manifest `actions`. It delegates to the existing session/UI-scoped controlled runtime, which still requires a registered action, a real trusted click, schema validation, authorization and (for writes) confirmation. Declaring an action never grants permission. Preserve a requestId across retries for writes whose outcomes are uncertain. No helper registers actions or bypasses the host allowlist.

Unregistered/disabled/unloaded components, incompatible versions, invalid props and missing renderers produce an error placeholder and never invoke extension code. The portable renderer may reject the whole invalid definition. Installed renderers that throw are contained by a per-node React error boundary; sibling components remain usable. Reinstallation creates a fresh boundary. Event-handler/async failures must be caught by the extension, as in the sample. The core intentionally does not fetch a replacement renderer or execute a model-provided fallback.
