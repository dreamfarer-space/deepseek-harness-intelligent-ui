/** @satisfies {import('deepseek-harness-intelligent-ui/catalog').CatalogExtension} */
export const manifest = {
  apiVersion: 1,
  namespace: 'example.git',
  version: '1.0.0',
  components: [{
    name: 'GitDiffViewer',
    description: 'Expandable unified Git diff with colored additions and deletions. Use diff text supplied by the host or user.',
    propsSchema: {
      type: 'object', additionalProperties: false, required: ['diff'],
      properties: { title: { type: 'string', maxLength: 120 }, diff: { type: 'string', maxLength: 20000 } },
    },
    actions: [],
  }],
};
export const definition = {
  title: 'Third-party component demo', root: 'diff', components: [{
    id: 'diff', type: 'example.git/GitDiffViewer', componentVersion: '1.0.0',
    props: { title: 'src/control.js', diff: '@@ -1,2 +1,2 @@\n-const gain = 1;\n+const gain = 2;\n export { gain };' },
  }],
};
