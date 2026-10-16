// Just enough PNG decoding (8-bit RGB/RGBA, non-interlaced, as Chrome writes
// screenshots) to tell a drawn WebGL canvas from a blank one without adding a
// dependency.
import { inflateSync } from 'node:zlib'

/** @returns {{ width: number, height: number, channels: number, pixels: Uint8Array }} */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8
  let width, height, channels
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const [depth, color, , , interlace] = data.subarray(8, 13)
      channels = { 2: 3, 6: 4 }[color]
      if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG (depth ${depth}, color ${color}, interlace ${interlace})`)
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0
      const b = y ? pixels[out - stride + x] : 0
      const c = x >= channels && y ? pixels[out - stride + x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixels[out + x] = v & 255
    }
  }
  return { width, height, channels, pixels }
}

/** Luminance spread and colour count of a screenshot: a blank canvas has ~0 spread and few colours. */
export function imageStats(buf) {
  const { width, height, channels, pixels } = decodePng(buf)
  let sum = 0, sq = 0
  const colors = new Set()
  const n = width * height
  for (let i = 0; i < n; i++) {
    const o = i * channels
    const l = 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]
    sum += l
    sq += l * l
    if (colors.size < 4096) colors.add((pixels[o] >> 3) << 10 | (pixels[o + 1] >> 3) << 5 | (pixels[o + 2] >> 3))
  }
  const mean = sum / n
  return { width, height, stddev: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(2), colors: colors.size }
}

/** Mean absolute per-channel difference (0-255) between two same-sized screenshots. */
export function imageDiff(a, b) {
  const x = decodePng(a), y = decodePng(b)
  if (x.width !== y.width || x.height !== y.height || x.channels !== y.channels) return 255
  let d = 0
  for (let i = 0; i < x.pixels.length; i++) d += Math.abs(x.pixels[i] - y.pixels[i])
  return +(d / x.pixels.length).toFixed(3)
}
