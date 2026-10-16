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
    expect(snapshot[0]).toMatchObject({ uiId: 'base', version: 3, definition: v3, turn: '3' });
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
