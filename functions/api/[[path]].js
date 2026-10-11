/*
 * Cloudflare Pages Function: forwards /api/* to the FPL API from the same
 * site that serves web/, so the page's default "./api/" just works.
 */
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const live = /^\/api\/(event\/\d+\/live|fixtures)/.test(url.pathname);
  const upstream = await fetch('https://fantasy.premierleague.com' + url.pathname + url.search, {
    headers: { 'User-Agent': 'Mozilla/5.0 (fpl_tools live viewer)', Accept: 'application/json' },
    cf: { cacheTtl: live ? 30 : 120, cacheEverything: true },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
