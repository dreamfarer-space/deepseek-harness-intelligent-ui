/** Version 1 uses the same bounded, fail-closed JSON Schema subset on both sides. */
export type PropSchema =
  | { type: 'object'; properties: Record<string, PropSchema>; required?: readonly string[]; additionalProperties: false }
  | { type: 'array'; items: PropSchema; maxItems?: number }
  | { type: 'string'; maxLength?: number; enum?: readonly string[] }
  | { type: 'number' | 'integer'; minimum?: number; maximum?: number; enum?: readonly number[] }
  | { type: 'boolean' | 'null' };
export type InferProps<S extends PropSchema> =
  S extends { type: 'object'; properties: infer P extends Record<string, PropSchema> }
    ? { [K in keyof P as K extends (S extends { required: readonly (infer R)[] } ? R : never) ? K : never]: InferProps<P[K]> }
      & { [K in keyof P as K extends (S extends { required: readonly (infer R)[] } ? R : never) ? never : K]?: InferProps<P[K]> }
    : S extends { type: 'array'; items: infer I extends PropSchema } ? InferProps<I>[]
    : S extends { enum: readonly (infer E)[] } ? E
    : S extends { type: 'string' } ? string
    : S extends { type: 'number' | 'integer' } ? number
    : S extends { type: 'boolean' } ? boolean : null;
export interface ComponentDefinition {
  name: string;
  description: string;
  propsSchema: Extract<PropSchema, { type: 'object' }>;
  children?: boolean;
  /** Existing host actionIds, still subject to the controlled runtime allowlist. */
  actions?: readonly string[];
}
export interface CatalogExtension {
  apiVersion: 1;
  namespace: string;
  version: string;
  components: readonly ComponentDefinition[];
}
export interface ExtensionHandle {
  readonly manifest: CatalogExtension;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}
export interface ExtensionEntry extends ComponentDefinition { version: string; generation: number; children: boolean; actions: readonly string[] }
export const CATALOG_API_VERSION: 1;
export function registerCatalogExtension(manifest: CatalogExtension): ExtensionHandle;
export function extensionEntry(type: string): ExtensionEntry | undefined;
export function extensionTypes(): string[];
export function catalogRevision(): number;
export function subscribeCatalog(listener: () => void): () => void;
