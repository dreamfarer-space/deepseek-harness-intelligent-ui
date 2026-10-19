/** Trusted installation API. Never exposed to widgets, tool arguments, or RPC. */
import { validateSchema } from '../controlled/runtime.js';

export const CATALOG_API_VERSION = 1;
const extensions = new Map();
const entries = new Map();
const listeners = new Set();
let revision = 0, generation = 0;
export const catalogRevision = () => revision;
export function subscribeCatalog(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { revision++; for (const listener of listeners) listener(); }
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function fail(message) { throw new Error(`Catalog extension: ${message}`); }
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function jsonCopy(v, depth = 0) {
  if (depth > 16) fail('manifest nesting exceeds limit');
  if (v === null || typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (Array.isArray(v)) return v.map(x => jsonCopy(x, depth + 1));
  if (!object(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('manifest must be plain JSON');
  const out = Object.create(null);
  for (const [k, value] of Object.entries(v)) {
    if (['__proto__', 'prototype', 'constructor'].includes(k)) fail(`reserved key ${k}`);
    out[k] = jsonCopy(value, depth + 1);
  }
  return out;
}
function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('unknown manifest field');
}

/**
 * Register a JSON manifest from trusted host code. Types are namespace/Name.
 * Version is immutable: publish a new version for every schema/renderer change.
 * Duplicate namespaces are refused even while disabled; dispose before reinstall.
 */
export function registerCatalogExtension(input) {
  const manifest = jsonCopy(input);
  if (JSON.stringify(manifest).length > 64_000) fail('manifest exceeds limit');
  fields(manifest, ['apiVersion', 'namespace', 'version', 'components']);
  if (manifest.apiVersion !== CATALOG_API_VERSION) fail(`unsupported apiVersion; expected ${CATALOG_API_VERSION}`);
  if (typeof manifest.namespace !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(manifest.namespace)) fail('invalid namespace');
  if (typeof manifest.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) fail('version must be major.minor.patch');
  if (extensions.has(manifest.namespace)) fail(`namespace ${manifest.namespace} already registered`);
  if (!Array.isArray(manifest.components) || !manifest.components.length || manifest.components.length > 32) fail('expected 1-32 components');
  if (extensions.size >= 32) fail('too many extensions');
  const pending = new Map();
  for (const component of manifest.components) {
    fields(component, ['name', 'description', 'propsSchema', 'children', 'actions']);
    if (typeof component.name !== 'string' || !/^[A-Z][A-Za-z0-9]{0,63}$/.test(component.name)) fail('invalid component name');
    const type = `${manifest.namespace}/${component.name}`;
    if (pending.has(type)) fail(`duplicate type ${type}`);
    if (typeof component.description !== 'string' || !component.description || component.description.length > 2000) fail('description required (max 2000 characters)');
    if (component.children !== undefined && typeof component.children !== 'boolean') fail('children must be boolean');
    if (component.actions !== undefined && (!Array.isArray(component.actions) || component.actions.length > 32 || component.actions.some(a => typeof a !== 'string' || !a || a.length > 100) || new Set(component.actions).size !== component.actions.length)) fail('invalid actions');
    if (component.propsSchema?.type !== 'object') fail('propsSchema must be an object schema');
    try { validateSchema(component.propsSchema, undefined, true); } catch (error) { fail(`invalid propsSchema for ${type}: ${error.message}`); }
    if (own(component.propsSchema.properties, 'children')) fail('children belongs on the node, not in propsSchema');
    pending.set(type, freeze({ ...component, children: component.children ?? false, generation: ++generation, version: manifest.version, actions: component.actions ?? [] }));
  }
  freeze(manifest);
  let enabled = true, disposed = false;
  const record = { manifest };
  extensions.set(manifest.namespace, record);
  for (const [type, entry] of pending) entries.set(type, entry);
  notify();
  return Object.freeze({
    manifest,
    setEnabled(value) {
      if (disposed) fail('extension disposed');
      if (typeof value !== 'boolean') fail('enabled must be boolean');
      if (enabled === value) return;
      enabled = value;
      for (const [type, entry] of pending) { if (enabled) entries.set(type, entry); else entries.delete(type); }
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      extensions.delete(manifest.namespace);
      for (const type of pending.keys()) entries.delete(type);
      notify();
    },
  });
}
export const extensionEntry = type => typeof type === 'string' ? entries.get(type) : undefined;
export const extensionTypes = () => [...entries.keys()];
