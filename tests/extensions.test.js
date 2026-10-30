import { afterEach, describe, expect, it } from 'vitest';
import { registerCatalogExtension, extensionEntry } from '../src/catalog/extensions.js';
import { catalogReference, componentTypes, COMPONENT_TYPES, validateProps, validateTree } from '../src/catalog/catalog.js';
import { applyPatch, snapshotOf } from '../src/catalog/patch.js';
import { createRenderTool } from '../src/tools/render.js';
import { createPatchTool } from '../src/tools/patch.js';
import { resolveConfig } from '../src/config.js';
import { manifest, definition } from '../examples/component-extension/manifest.js';
import { projectNativeUiEvents } from '../src/portable/artifacts.js';
const copy = v => JSON.parse(JSON.stringify(v));
const handles = [];
const install = (m = manifest) => { const h = registerCatalogExtension(m); handles.push(h); return h; };
afterEach(() => { for (const h of handles.splice(0)) h.dispose(); });

describe('trusted catalog extensions', () => {
  it('updates existing tools, validation, patching and native event projection from one manifest', async () => {
    const render = createRenderTool(resolveConfig({})), patch = createPatchTool(resolveConfig({}));
    expect(render.parameters.properties.components.items.properties.type.enum).not.toContain('example.git/GitDiffViewer');
    install();
    expect(COMPONENT_TYPES).toHaveLength(29);
    expect(componentTypes()).toHaveLength(COMPONENT_TYPES.length + 1);
    expect(render.description).toContain('example.git/GitDiffViewer (componentVersion: 1.0.0)');
    expect(catalogReference()).toContain('"required":["diff"]');
    expect(render.parameters.properties.components.items.properties.type.enum).toContain('example.git/GitDiffViewer');
    expect(patch.parameters.properties.ops.items.properties.nodes.items.properties.type.enum).toContain('example.git/GitDiffViewer');
    expect(patch.parameters.properties.ops.items.properties.node.properties.type.enum).toContain('example.git/GitDiffViewer');
    expect(validateTree(copy(definition)).ok).toBe(true);
    expect((await render.execute(copy(definition))).ok).toBe(true);
    const ui = snapshotOf('u', definition);
    const result = applyPatch(ui, { uiId: 'u', baseVersion: 1, ops: [{ op: 'replaceNode', id: 'diff', node: definition.components[0] }] });
    expect(result.ok).toBe(true);
    expect(result.ui.components[0].componentVersion).toBe('1.0.0');
    const messages = [{ role: 'assistant', content: [{ type: 'tool-call', id: 'u', name: 'ui_render', arguments: JSON.stringify(definition) }] }, { role: 'tool', toolCallId: 'u' }];
    expect((await patch.execute({ uiId: 'u', baseVersion: 1, ops: [{ op: 'setProps', id: 'diff', props: { title: 'Updated' } }] }, { agent: { session: { deriveMessages: () => messages } } })).ok).toBe(true);
    const events = [
      { seq: 1, type: 'tool/call', data: { name: 'ui_render', callId: 'u', arguments: JSON.stringify(definition) } },
      { seq: 2, type: 'tool/result', data: { callId: 'u', meta: { ok: true } } },
    ];
    expect(projectNativeUiEvents(events, { hostId: 'h', sessionId: 's' })).toHaveLength(1);
  });

  it('rejects invalid props, unknown props, invalid children, missing versions and incompatible versions', () => {
    install();
    for (const props of [{}, { diff: 3 }, { diff: 'x', code: 'alert(1)' }, { diff: 'x'.repeat(20001) }]) {
      expect(validateProps('example.git/GitDiffViewer', props).length).toBeGreaterThan(0);
    }
    for (const componentVersion of [undefined, '2.0.0', 1]) {
      const tree = copy(definition); tree.components[0].componentVersion = componentVersion;
      expect(validateTree(tree).errors.join()).toContain('requires 1.0.0');
    }
    const child = copy(definition); child.components[0].children = ['text']; child.components.push({ id: 'text', type: 'Text', props: { text: 'x' } });
    expect(validateTree(child).errors.join()).toContain('cannot have children');
    expect(validateProps('__proto__', {}).join()).toContain('unknown component');
    expect(validateProps('constructor', {}).join()).toContain('unknown component');
  });

  it('rejects extension props.children consistently in render, insert, replace and native projection', async () => {
    install();
    const invalid = copy(definition);
    invalid.components[0].props.children = [];
    expect(validateProps(invalid.components[0].type, invalid.components[0].props).length).toBeGreaterThan(0);
    expect(validateTree(copy(invalid)).ok).toBe(false);
    expect((await createRenderTool(resolveConfig({})).execute(copy(invalid))).ok).toBe(false);
    const node = invalid.components[0];
    const ui = snapshotOf('u', { root: 'r', components: [{ id: 'r', type: 'Stack' }] });
    for (const op of [
      { op: 'insertChild', parent: 'r', id: node.id, nodes: [node] },
      { op: 'replaceNode', id: 'r', node: { ...node, id: 'r' } },
    ]) expect(applyPatch(ui, { uiId: 'u', baseVersion: 1, ops: [op] }).ok).toBe(false);
    const events = [
      { seq: 1, type: 'tool/call', data: { name: 'ui_render', callId: 'u', arguments: JSON.stringify(invalid) } },
      { seq: 2, type: 'tool/result', data: { callId: 'u', meta: { ok: true } } },
    ];
    expect(projectNativeUiEvents(events, { hostId: 'h', sessionId: 's' })).toEqual([]);
  });

  it('keeps host tool enums and execution current after disabling/uninstalling and supports reinstall', async () => {
    const h = install(), tool = createRenderTool(resolveConfig({}));
    h.setEnabled(false);
    expect(tool.description).not.toContain('example.git/GitDiffViewer');
    expect((await tool.execute(copy(definition))).ok).toBe(false);
    expect(() => install()).toThrow(/already registered/);
    h.setEnabled(true);
    expect(validateTree(copy(definition)).ok).toBe(true);
    h.dispose(); h.dispose();
    expect(validateTree(copy(definition)).ok).toBe(false);
    expect(() => h.setEnabled(true)).toThrow(/disposed/);
    install();
    h.dispose(); // an old disposer cannot remove the new installation
    expect(validateTree(copy(definition)).ok).toBe(true);
  });

  it('freezes a defensive copy; callers cannot change a published schema in place', () => {
    const input = copy(manifest), h = install(input);
    input.components[0].propsSchema.properties.diff.type = 'number';
    expect(validateProps('example.git/GitDiffViewer', { diff: 'valid' })).toEqual([]);
    expect(Object.isFrozen(h.manifest.components[0].propsSchema.properties.diff)).toBe(true);
    expect(Object.isFrozen(extensionEntry('example.git/GitDiffViewer'))).toBe(true);
  });

  it.each([
    m => { m.apiVersion = 2; },
    m => { m.namespace = 'Card'; },
    m => { m.version = 'latest'; },
    m => { m.components.push(copy(m.components[0])); },
    m => { m.components[0].propsSchema.properties.diff = { type: 'function' }; },
    m => { m.components[0].propsSchema.properties.diff = { type: 'string', pattern: '.*' }; },
    m => { m.components[0].propsSchema.additionalProperties = true; },
    m => { m.components[0].propsSchema.properties.children = { type: 'string' }; },
    m => { m.components[0].render = '() => eval(code)'; },
    m => { m.components[0].actions = [1]; },
    m => { m.components[0].propsSchema.properties.diff = JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"}},"additionalProperties":false}'); },
  ])('rejects incompatible or malformed manifests atomically (%#)', change => {
    const m = copy(manifest); change(m);
    expect(() => install(m)).toThrow();
    expect(componentTypes()).toEqual(COMPONENT_TYPES);
    install(); // a failed registration never reserves the namespace
  });

  it('does not register extensions from tool arguments or generated component props', async () => {
    const render = createRenderTool(resolveConfig({}));
    const args = { ...copy(definition), extensions: [manifest], jsFunctions: 'globalThis.pwned = true' };
    expect((await render.execute(args)).ok).toBe(false);
    expect(componentTypes()).toEqual(COMPONENT_TYPES);
    expect(globalThis.pwned).toBeUndefined();
  });
});
