// Installed package API, also works directly from this repository (self-reference).
import { registerCatalogExtension } from 'deepseek-harness-intelligent-ui/catalog';
import { manifest } from './manifest.js';

export const name = 'example-git-components';
export function apply(ctx) {
  ctx.effect(() => {
    const extension = registerCatalogExtension(manifest);
    return () => extension.dispose();
  });
}
