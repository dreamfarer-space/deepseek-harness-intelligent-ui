/** Trusted module, loaded by the installer. No eval or model-provided source. */
export const renderers = {
  GitDiffViewer({ props, h, streaming, stopped, sendPrompt }) {
    return h('details', { open: true },
      h('summary', null, props.title ?? 'Git diff'),
      h('pre', { style: { overflowX: 'auto', padding: 12, background: 'var(--ui-surface)' } },
        ...props.diff.split('\n').map((line, i) => h('div', { key: i, style: {
          color: line.startsWith('+') ? 'var(--ui-success)' : line.startsWith('-') ? 'var(--ui-error)' : 'inherit',
        } }, line || '\u00a0'))),
      h('button', { type: 'button', disabled: streaming || stopped, onClick: () => { void sendPrompt('Explain this Git diff').catch(() => {}) } }, 'Explain this diff'),
    );
  },
};
