/*
 * Cloudflare Worker for the hosted viewer: serves web/ as static assets and
 * forwards /api/* to the FPL API (which browsers can't call directly).
 * Config: wrangler.jsonc. CORS is open so a copy of web/ hosted elsewhere
 * can also point its API proxy setting here.
 */
const UPSTREAM = 'https://fantasy.premierleague.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function proxy(request, url) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });
  const live = /^\/api\/(event\/\d+\/live|fixtures)/.test(url.pathname);
  const headers = new Headers(CORS);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  // Read the whole body here so a dropped upstream connection becomes a
  // clear 502 instead of a broken stream (a browser "NetworkError").
  try {
    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { 'User-Agent': 'Mozilla/5.0 (fpl_tools live viewer)', Accept: 'application/json' },
      cf: { cacheTtl: live ? 30 : 120, cacheEverything: true },
    });
    const body = await upstream.arrayBuffer();
    if (!upstream.ok) {
      console.error(`FPL ${upstream.status} for ${url.pathname}`);
      const detail = new TextDecoder().decode(body.slice(0, 200)).replace(/\s+/g, ' ');
      return new Response(JSON.stringify({ error: `FPL answered ${upstream.status}`, detail }), { status: upstream.status, headers });
    }
    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error(`FPL fetch failed for ${url.pathname}: ${err.message}`);
    return new Response(JSON.stringify({ error: `FPL unreachable: ${err.message}` }), { status: 502, headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return proxy(request, url);
    return env.ASSETS.fetch(request);
  },
};
