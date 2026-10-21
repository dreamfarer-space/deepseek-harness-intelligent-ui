import { describe, expect, it } from 'vitest';
import { projectNativeUiEvents } from '../src/portable/artifacts.js';

const tree = { root: 'root', components: [{ id: 'root', type: 'Text', props: { text: 'Hello' } }] };
function call(seq, id, name, args, turn = 1) {
  return { type: 'tool/call', seq, data: { callId: id, name, arguments: JSON.stringify(args), turn } };
}
function result(seq, id, meta, isError = false) {
  return { type: 'tool/result', seq, data: { message: { source: { callId: id }, content: [], isError }, meta } };
}
describe('native portable artifact contract', () => {
  it('rebuilds v1 + two full snapshots even with unsorted history', () => {
    const patch = baseVersion => ({ uiId: 'base', baseVersion, ops: [{ op: 'setProps', id: 'root', props: { text: String(baseVersion) } }] });
    const v2 = { ...tree, uiId: 'base', version: 2 };
    const v3 = { ...tree, uiId: 'base', version: 3 };
    const list = [
      call(1, 'base', 'ui_render', tree), result(2, 'base', { ok: true }),
      call(3, 'patch2', 'ui_patch', patch(1), 2), result(4, 'patch2', { ok: true, ui: v2 }),
      call(5, 'patch3', 'ui_patch', patch(2), 3), result(6, 'patch3', { ok: true, ui: v3 }),
    ];
    const snapshot = projectNativeUiEvents(list.reverse(), { hostId: 'h1', sessionId: 's1' });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ uiId: 'base', version: 3, definition: v3, turn: '1', updatedTurn: '3' });
  });

  it('projects a composition and applies a patch to one of its catalog blocks', () => {
    const composed = { blocks: [
      { id: 'intro', type: 'markdown', text: 'Before.' },
      { id: 'chart', type: 'catalog', title: 'Chart', root: 'root', components: [{ id: 'root', type: 'Text', props: { text: 'Hello' } }] },
      { id: 'other', type: 'catalog', ...tree },
      { id: 'sim', type: 'widget', html: '<div id="x"></div>' },
    ] }
    const patch = { uiId: 'comp#chart', baseVersion: 1, ops: [{ op: 'setProps', id: 'root', props: { text: 'Patched' } }] }
    const snapshot = { root: 'root', components: [{ id: 'root', type: 'Text', props: { text: 'Patched' } }], uiId: 'comp#chart', version: 2 }
    const list = [
      call(1, 'comp', 'ui_compose', composed), result(2, 'comp', { ok: true }),
      call(3, 'p1', 'ui_patch', patch, 2), result(4, 'p1', { ok: true, ui: snapshot }),
      call(5, 'p2', 'ui_patch', { ...patch, uiId: 'comp#other' }, 3),
      result(6, 'p2', { ok: true, ui: { ...snapshot, uiId: 'comp#other' } }),
      call(7, 'stale', 'ui_patch', patch, 4), result(8, 'stale', { ok: true, ui: snapshot }),
      call(9, 'p3', 'ui_patch', { ...patch, baseVersion: 2 }, 5),
      result(10, 'p3', { ok: true, ui: { ...snapshot, version: 3 } }),
    ]
    const [artifact] = projectNativeUiEvents(list, { hostId: 'h1', sessionId: 's1' })
    expect(artifact).toMatchObject({ kind: 'composition', uiId: 'comp', version: 4, updatedTurn: '5' })
    expect(artifact.definition.blocks[0]).toEqual(composed.blocks[0])
    expect(artifact.definition.blocks[1].components[0].props.text).toBe('Patched')
    expect(artifact.definition.blocks[2].components[0].props.text).toBe('Patched')
    expect(artifact.definition.blocks[3]).toEqual(composed.blocks[3])
    // A refused composition is never projected.
    const bad = [{ ...call(1, 'bad', 'ui_compose', { blocks: [{ id: 'x', type: 'catalog', root: 'r', components: [] }] }), data: { ...call(1, 'bad', 'ui_compose', { blocks: [] }).data } }, result(2, 'bad', { ok: true })]
    expect(projectNativeUiEvents(bad, { hostId: 'h1', sessionId: 's1' })).toEqual([])
    // A patch for an unknown block of a composition is ignored.
    const stranger = [call(1, 'comp', 'ui_compose', composed), result(2, 'comp', { ok: true }),
      call(3, 'p2', 'ui_patch', { ...patch, uiId: 'comp#nope' }, 2), result(4, 'p2', { ok: true, ui: { ...snapshot, uiId: 'comp#nope' } })]
    expect(projectNativeUiEvents(stranger, { hostId: 'h1', sessionId: 's1' })[0].version).toBe(1)
  });

  it('ignores failed/stale/metadata-less calls and scopes to Host and Session', () => {
    const list = [
      call(1, 'base', 'ui_render', tree), result(2, 'base', { ok: true }),
      call(3, 'bad', 'ui_patch', { uiId: 'base', baseVersion: 1, ops: [] }),
      result(4, 'bad', { ok: true, ui: { ...tree, uiId: 'base', version: 9 } }),
      call(5, 'stopped', 'ui_patch', { uiId: 'base', baseVersion: 1, ops: [] }),
      result(6, 'stopped', { ok: true, ui: { ...tree, uiId: 'base', version: 2 } }, true),
      call(7, 'no-meta', 'ui_render', tree), result(8, 'no-meta', {}),
    ];
    expect(projectNativeUiEvents(list, { hostId: 'h1', sessionId: 's1' }).map(x => x.version)).toEqual([1]);
    expect(projectNativeUiEvents(list, { hostId: '', sessionId: 's1' })).toEqual([]);
  });
});
