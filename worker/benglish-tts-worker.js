/*
 * Benglish – server de voce (Cloudflare Worker) pentru ElevenLabs.
 * Cheia ElevenLabs stă DOAR aici, ca secret (ELEVENLABS_API_KEY). Aplicația nu o vede niciodată.
 *
 * Variabile (Settings → Variables and Secrets):
 *   ELEVENLABS_API_KEY  (secret)  cheia de la ElevenLabs
 *   APP_KEY             (secret)  codul aplicației, pe care îl scrii o singură dată în aplicație
 *   ALLOWED_ORIGINS     (text, opțional) implicit: https://cazacubeniamin1988-dot.github.io
 *   DAILY_CHAR_LIMIT    (text, opțional) câte caractere noi pe zi poate genera (implicit 20000)
 *   MODEL_ID            (text, opțional) implicit: eleven_multilingual_v2
 * Legătură KV (Settings → Bindings → KV namespace): numele variabilei TTS_CACHE
 *   – păstrează fiecare înregistrare generată, ca același text să nu se plătească de două ori.
 */
const VOICES = {
  brian: 'nPczCjzI2devNBz1zQrb', // cald, rezonant, matur – implicit
  eric:  'cjVigY5qzO86Huf0OWal', // calm, clar, ~40 de ani
  chris: 'iP95p4xoKVk53GoZ742B', // natural, prietenos
  bill:  'pqHfZKP75CvOlQylNhV4', // prietenos, de povestitor
};
const MAX_TEXT = 2500;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cazacubeniamin1988-dot.github.io').split(',').map(s => s.trim());
  const h = { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-App-Key', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json' } });
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const h = cors(req.headers.get('Origin'), env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!env.APP_KEY || !env.ELEVENLABS_API_KEY) return json({ error: 'server_not_configured' }, 500, h);
    if (!sameKey(req.headers.get('X-App-Key') || '', env.APP_KEY)) return json({ error: 'bad_app_key' }, 401, h);

    const day = new Date().toISOString().slice(0, 10);
    const limit = +(env.DAILY_CHAR_LIMIT || 20000);
    const usedKey = 'used:' + day;
    const used = env.TTS_CACHE ? +(await env.TTS_CACHE.get(usedKey) || 0) : 0;

    if (url.pathname === '/health') return json({ ok: true, voices: Object.keys(VOICES), used, limit, cache: !!env.TTS_CACHE }, 200, h);
    if (url.pathname !== '/tts' || req.method !== 'POST') return json({ error: 'not_found' }, 404, h);

    let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, h); }
    const text = String(body.text || '').replace(/\s+/g, ' ').trim();
    const voice = VOICES[body.voice] ? body.voice : 'brian';
    if (!text) return json({ error: 'empty' }, 400, h);
    if (text.length > MAX_TEXT) return json({ error: 'too_long', max: MAX_TEXT }, 413, h);

    const model = env.MODEL_ID || 'eleven_multilingual_v2';
    const key = 'a:' + voice + ':' + await sha256(model + '|' + text);
    const audioHeaders = { ...h, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' };

    if (env.TTS_CACHE) {
      const hit = await env.TTS_CACHE.get(key, 'arrayBuffer');
      if (hit) return new Response(hit, { headers: { ...audioHeaders, 'X-Cache': 'HIT' } });
    }
    if (used + text.length > limit) return json({ error: 'daily_limit', used, limit }, 429, h);

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voice]}?output_format=mp3_44100_96`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text, model_id: model,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return json({ error: 'elevenlabs_' + r.status, detail }, 502, h);
    }
    const audio = await r.arrayBuffer();
    if (env.TTS_CACHE) {
      ctx.waitUntil(Promise.all([
        env.TTS_CACHE.put(key, audio),
        env.TTS_CACHE.put(usedKey, String(used + text.length), { expirationTtl: 60 * 60 * 48 }),
      ]));
    }
    return new Response(audio, { headers: { ...audioHeaders, 'X-Cache': 'MISS' } });
  },
};
