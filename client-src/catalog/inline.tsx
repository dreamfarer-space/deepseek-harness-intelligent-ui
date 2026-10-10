import { Fragment, type ReactNode } from 'react'

/**
 * Markdown subset → React elements, never HTML strings:
 * **bold**, *italic* / _italic_, `code`, [label](https://url), line breaks.
 * Links must be http(s) and open in a new tab.
 */
const TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g

function safeHref(raw: string): string | undefined {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}

function renderLine(line: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of line.matchAll(TOKEN)) {
    const tok = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(line.slice(last, at))
    const key = `${keyBase}-${i++}`
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={key} className="diui-code-inline">{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const close = tok.indexOf('](')
      const label = tok.slice(1, close)
      const href = safeHref(tok.slice(close + 2, -1))
      out.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label)
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>)
    last = at + tok.length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

export function Inline(props: { text: string }) {
  const lines = props.text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderLine(line, String(i))}
        </Fragment>
      ))}
    </>
  )
}
