// The build maps this import to the already loaded DSH core-client module ID.
import { registerComponentExtension } from 'deepseek-harness-intelligent-ui/client';
import { manifest } from './manifest.js';
import { renderers } from './renderers.js';
export function apply(ctx) {
  ctx.effect(() => {
    const extension = registerComponentExtension(manifest, renderers);
    return () => extension.dispose();
  });
}
