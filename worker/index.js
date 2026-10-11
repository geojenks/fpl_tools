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
  let upstream;
  try {
    upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { 'User-Agent': 'Mozilla/5.0 (fpl_tools live viewer)', Accept: 'application/json' },
      cf: { cacheTtl: live ? 30 : 120, cacheEverything: true },
    });
  } catch (err) {
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: `FPL unreachable: ${err.message}` }), { status: 502, headers });
  }
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return proxy(request, url);
    return env.ASSETS.fetch(request);
  },
};
