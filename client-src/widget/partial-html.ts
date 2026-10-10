/**
 * Make a streaming HTML prefix safe to morph into the preview frame.
 * Same idea as OpenIntelligentUI's process-partial-html: drop a trailing
 * unfinished tag / entity, and strip script/style/head blocks (code runs only
 * in the final render; css is applied separately).
 */

const BLOCKS = /<(script|style|head)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi

/**
 * @param html - possibly truncated body markup.
 * @returns markup ending on a tag boundary, without executable/style blocks.
 */
export function processPartialHtml(html: string): string {
  let out = html
  // Unterminated comment at the tail.
  const lastComment = out.lastIndexOf('<!--')
  if (lastComment >= 0 && out.indexOf('-->', lastComment) < 0) out = out.slice(0, lastComment)
  // Unfinished tag at the tail: a '<' with no '>' after it.
  const lt = out.lastIndexOf('<')
  if (lt >= 0 && out.indexOf('>', lt) < 0) out = out.slice(0, lt)
  // Unfinished entity at the tail, e.g. "&amp" or "&#12".
  out = out.replace(/&[#a-zA-Z0-9]{0,10}$/, '')
  out = out.replace(BLOCKS, '')
  // Inline event handlers must not fire in the preview (the final render owns behavior).
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  return out
}
