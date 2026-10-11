/*
 * Cloudflare Worker that forwards /api/* to the FPL API and adds CORS headers,
 * so the viewer can be hosted anywhere (e.g. GitHub Pages) and used on a phone.
 * Deploy: see README.md. Free tier is plenty for a few friends.
 */
const UPSTREAM = 'https://fantasy.premierleague.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404, headers: CORS });

    const live = /^\/api\/(event\/\d+\/live|fixtures)/.test(url.pathname);
    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { 'User-Agent': 'Mozilla/5.0 (fpl_tools live viewer)', Accept: 'application/json' },
      cf: { cacheTtl: live ? 30 : 120, cacheEverything: true },
    });
    const headers = new Headers(CORS);
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
