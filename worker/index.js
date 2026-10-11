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

// The page sends FPL paths base64url-encoded (/api/v/<code>) because content
// blockers in some browsers block same-site requests whose address contains
// tracker-like words such as /event/ or /entry/.
const SAFE_PATH = /^[A-Za-z0-9_\-/?=&.]+$/;
function decodePath(code) {
  try {
    const path = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return SAFE_PATH.test(path) && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}

async function proxy(request, url) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });
  let apiPath = url.pathname.slice('/api/'.length) + url.search;
  if (url.pathname.startsWith('/api/v/')) {
    apiPath = decodePath(url.pathname.slice('/api/v/'.length));
    if (!apiPath) return new Response(JSON.stringify({ error: 'Bad request path' }), { status: 400, headers: CORS });
  }
  const live = /^(event\/\d+\/live|fixtures)/.test(apiPath);
  const headers = new Headers(CORS);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  // Read the whole body here so a dropped upstream connection becomes a
  // clear 502 instead of a broken stream (a browser "NetworkError").
  try {
    const started = Date.now();
    const upstream = await fetch(`${UPSTREAM}/api/${apiPath}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (fpl_tools live viewer)', Accept: 'application/json' },
      cf: { cacheTtl: live ? 30 : 120, cacheEverything: true },
      signal: AbortSignal.timeout(20000),
    });
    console.log(`FPL ${upstream.status} for ${apiPath} in ${Date.now() - started}ms`);
    const body = await upstream.arrayBuffer();
    if (!upstream.ok) {
      console.error(`FPL ${upstream.status} for ${apiPath}`);
      const detail = new TextDecoder().decode(body.slice(0, 200)).replace(/\s+/g, ' ');
      return new Response(JSON.stringify({ error: `FPL answered ${upstream.status}`, detail }), { status: upstream.status, headers });
    }
    return new Response(body, { status: 200, headers });
  } catch (err) {
    console.error(`FPL fetch failed for ${apiPath}: ${err.name} ${err.message}`);
    const why = err.name === 'TimeoutError' ? 'FPL took more than 20 seconds to answer' : `FPL unreachable: ${err.message}`;
    return new Response(JSON.stringify({ error: why }), { status: err.name === 'TimeoutError' ? 504 : 502, headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Health check that doesn't touch FPL: shows the Worker itself is answering.
    if (url.pathname === '/api/_ping') {
      return new Response(JSON.stringify({ ok: true, worker: 'fpl-tools', time: new Date().toISOString() }), {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    if (url.pathname.startsWith('/api/')) return proxy(request, url);
    return env.ASSETS.fetch(request);
  },
};
