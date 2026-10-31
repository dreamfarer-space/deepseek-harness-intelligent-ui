/**
 * Video platform links shared by Host validation and the browser renderer.
 * YouTube, Bilibili and Vimeo page links map onto each platform's official
 * embed player; only well-formed ids are accepted and the player URL is
 * rebuilt from the id, never copied from model input.
 * @module deepseek-harness-intelligent-ui/catalog/video
 */

/** @typedef {'youtube' | 'bilibili' | 'vimeo'} VideoProvider */
/**
 * @typedef {object} EmbedSource
 * @property {VideoProvider} provider
 * @property {string} page - the platform page, for "open on …".
 * @property {(autoplay: boolean) => string} player - embed URL; autoplay only after the user pressed play.
 */

export const PROVIDER_NAMES = Object.freeze({ youtube: 'YouTube', bilibili: 'Bilibili', vimeo: 'Vimeo' });

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const BV_ID = /^BV[0-9A-Za-z]{10}$/;
const VIMEO_ID = /^\d{1,12}$/;

const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** @param {unknown} raw @returns {URL | undefined} absolute https URL without credentials */
function httpsUrl(raw) {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The platform a link belongs to, recognised or not (used to explain a bad link).
 * @param {unknown} raw
 * @returns {VideoProvider | undefined}
 */
export function videoPlatform(raw) {
  const host = httpsUrl(raw)?.hostname.toLowerCase();
  if (!host) return undefined;
  if (hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com') || host === 'youtu.be') return 'youtube';
  if (hostIs(host, 'bilibili.com') || host === 'b23.tv') return 'bilibili';
  if (hostIs(host, 'vimeo.com')) return 'vimeo';
  return undefined;
}

/**
 * @param {unknown} raw - page link given by the model.
 * @param {number} [start] - start offset in seconds.
 * @returns {EmbedSource | undefined}
 */
export function embedSource(raw, start = 0) {
  const url = httpsUrl(raw);
  const provider = videoPlatform(raw);
  if (!url || !provider) return undefined;
  const host = url.hostname.toLowerCase();
  const t = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
  const parts = url.pathname.split('/').filter(Boolean);
  if (provider === 'youtube') {
    const id = host === 'youtu.be' ? parts[0]
      : parts[0] === 'watch' || parts.length === 0 ? url.searchParams.get('v') ?? undefined
      : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : undefined;
    if (!id || !YT_ID.test(id)) return undefined;
    return {
      provider,
      page: `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}s` : ''}`,
      player: autoplay => `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${t ? `&start=${t}` : ''}${autoplay ? '&autoplay=1' : ''}`,
    };
  }
  if (provider === 'bilibili') {
    const bvid = parts[0] === 'video' ? parts[1] : host === 'player.bilibili.com' ? url.searchParams.get('bvid') ?? undefined : undefined;
    if (!bvid || !BV_ID.test(bvid)) return undefined;
    const p = Number(url.searchParams.get('p') ?? url.searchParams.get('page') ?? 1);
    const page = Number.isInteger(p) && p >= 1 && p <= 1000 ? p : 1;
    return {
      provider,
      page: `https://www.bilibili.com/video/${bvid}/${page > 1 ? `?p=${page}` : ''}`,
      player: autoplay => `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&high_quality=1&danmaku=0&autoplay=${autoplay ? 1 : 0}${t ? `&t=${t}` : ''}`,
    };
  }
  const id = host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts.find(s => VIMEO_ID.test(s));
  if (!id || !VIMEO_ID.test(id)) return undefined;
  return {
    provider,
    page: `https://vimeo.com/${id}`,
    player: autoplay => `https://player.vimeo.com/video/${id}?dnt=1${autoplay ? '&autoplay=1' : ''}${t ? `#t=${t}s` : ''}`,
  };
}
