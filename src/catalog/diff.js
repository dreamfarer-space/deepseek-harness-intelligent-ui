/**
 * Line diff for the CodeDiff component (Myers O((N+M)·D)). Shared by the Host
 * (limits are checked at validation time) and the browser renderer. Output is
 * plain text lines; nothing here interprets the content.
 * @module deepseek-harness-intelligent-ui/catalog/diff
 */

/** Edit distance above which the diff gives up and reports the whole file as replaced. */
export const MAX_DIFF_EDITS = 2000;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (text === '') return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * @typedef {{ op: ' ' | '-' | '+', text: string, oldNo?: number, newNo?: number }} DiffLine
 */

/**
 * Diff two texts line by line.
 * @param {string} before
 * @param {string} after
 * @returns {{ lines: DiffLine[], added: number, removed: number, truncated: boolean }}
 */
export function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  const script = myers(a, b);
  /** @type {DiffLine[]} */
  const lines = [];
  let added = 0;
  let removed = 0;
  if (!script) {
    a.forEach((text, i) => lines.push({ op: '-', text, oldNo: i + 1 }));
    b.forEach((text, i) => lines.push({ op: '+', text, newNo: i + 1 }));
    return { lines, added: b.length, removed: a.length, truncated: true };
  }
  let i = 0;
  let j = 0;
  for (const op of script) {
    if (op === ' ') lines.push({ op, text: a[i], oldNo: ++i, newNo: ++j });
    else if (op === '-') { lines.push({ op, text: a[i], oldNo: ++i }); removed++; }
    else { lines.push({ op, text: b[j], newNo: ++j }); added++; }
  }
  return { lines, added, removed, truncated: false };
}

/**
 * Shortest edit script as a list of ' ', '-', '+' operations, or null when the
 * edit distance exceeds {@link MAX_DIFF_EDITS}.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {(' ' | '-' | '+')[] | null}
 */
function myers(a, b) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_DIFF_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  /** @type {Int32Array[]} */
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, offset, n, m, d);
    }
  }
  return null;
}

function backtrack(trace, offset, n, m, dEnd) {
  /** @type {(' ' | '-' | '+')[]} */
  const ops = [];
  let x = n;
  let y = m;
  for (let d = dEnd; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = v[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push(' '); x--; y--; }
    ops.push(x === prevX ? '+' : '-');
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) { ops.push(' '); x--; y--; }
  return ops.reverse();
}

/**
 * Group a diff into hunks with `context` unchanged lines around each change;
 * longer unchanged runs collapse to a `skip` marker the UI can expand.
 * @param {DiffLine[]} lines
 * @param {number} context
 * @returns {({ kind: 'lines', lines: DiffLine[] } | { kind: 'skip', lines: DiffLine[] })[]}
 */
export function hunks(lines, context = 3) {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.op === ' ') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const kind = keep[i] ? 'lines' : 'skip';
    const start = i;
    while (i < lines.length && (keep[i] ? 'lines' : 'skip') === kind) i++;
    out.push({ kind, lines: lines.slice(start, i) });
  }
  return out;
}

/**
 * Parse one file's unified diff (`@@ -a,b +c,d @@` hunks; `---`/`+++`/`diff`
 * headers are skipped) into numbered lines. Lines between hunks are unknown,
 * so each hunk after the first is preceded by a `gap` marker.
 * @param {string} patch
 * @returns {{ lines: (DiffLine | { op: 'gap', text: string })[], added: number, removed: number }}
 */
export function parsePatch(patch) {
  /** @type {(DiffLine | { op: 'gap', text: string })[]} */
  const lines = [];
  let oldNo = 0;
  let newNo = 0;
  let added = 0;
  let removed = 0;
  let inHunk = false;
  for (const raw of splitLines(patch)) {
    const head = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
    if (head) {
      if (inHunk || Number(head[1]) > 1) lines.push({ op: 'gap', text: head[3].trim() });
      oldNo = Number(head[1]);
      newNo = Number(head[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith('\\')) continue;
    const op = raw[0];
    const text = raw.slice(1);
    if (op === '+') { lines.push({ op: '+', text, newNo: newNo++ }); added++; }
    else if (op === '-') { lines.push({ op: '-', text, oldNo: oldNo++ }); removed++; }
    else if (op === ' ' || raw === '') lines.push({ op: ' ', text, oldNo: oldNo++, newNo: newNo++ });
    else inHunk = false; // a following file's header
  }
  return { lines, added, removed };
}
