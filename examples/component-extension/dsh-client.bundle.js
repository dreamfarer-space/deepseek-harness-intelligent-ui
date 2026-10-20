// Generated trusted companion client; never bundle a private core registry.
window.__ModuleLoader__.load({ id: "@example/intelligent-ui-git", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// examples/component-extension/dsh-client.js
var dsh_client_exports = {};
__export(dsh_client_exports, {
  apply: () => apply
});
module.exports = __toCommonJS(dsh_client_exports);
var import_client = require("deepseek-harness-intelligent-ui");

// examples/component-extension/manifest.js
var manifest = {
  apiVersion: 1,
  namespace: "example.git",
  version: "1.0.0",
  components: [{
    name: "GitDiffViewer",
    description: "Expandable unified Git diff with colored additions and deletions. Use diff text supplied by the host or user.",
    propsSchema: {
      type: "object",
      additionalProperties: false,
      required: ["diff"],
      properties: { title: { type: "string", maxLength: 120 }, diff: { type: "string", maxLength: 2e4 } }
    },
    actions: []
  }]
};

// examples/component-extension/renderers.js
var renderers = {
  GitDiffViewer({ props, h, streaming, stopped, sendPrompt }) {
    return h(
      "details",
      { open: true },
      h("summary", null, props.title ?? "Git diff"),
      h(
        "pre",
        { style: { overflowX: "auto", padding: 12, background: "var(--ui-surface)" } },
        ...props.diff.split("\n").map((line, i) => h("div", { key: i, style: {
          color: line.startsWith("+") ? "var(--ui-success)" : line.startsWith("-") ? "var(--ui-error)" : "inherit"
        } }, line || "\xA0"))
      ),
      h("button", { type: "button", disabled: streaming || stopped, onClick: () => {
        void sendPrompt("Explain this Git diff").catch(() => {
        });
      } }, "Explain this diff")
    );
  }
};

// examples/component-extension/dsh-client.js
function apply(ctx) {
  ctx.effect(() => {
    const extension = (0, import_client.registerComponentExtension)(manifest, renderers);
    return () => extension.dispose();
  });
}
return module.exports; } });
