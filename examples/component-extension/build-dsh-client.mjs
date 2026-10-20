import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const id = '@example/intelligent-ui-git';
await build({
  entryPoints: [fileURLToPath(new URL('./dsh-client.js', import.meta.url))],
  outfile: fileURLToPath(new URL('./dsh-client.bundle.js', import.meta.url)),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2020',
  plugins: [{ name: 'shared-intelligent-ui-client', setup(b) {
    b.onResolve({ filter: /^deepseek-harness-intelligent-ui\/client$/ }, () => ({ path: 'deepseek-harness-intelligent-ui', external: true }));
  } }],
  banner: { js: `// Generated trusted companion client; never bundle a private core registry.\nwindow.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
});
