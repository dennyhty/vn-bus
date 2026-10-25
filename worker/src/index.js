// Cloudflare Worker: fetches one public Vexere route page and returns it as JSON.
//
// GET /route?path=bus-ticket-booking-from-saigon-to-da-lat-129t23991.html
//
// Only the public, undated route page is requested (robots.txt disallows the
// dated "?date=" form). Responses are cached so repeated searches do not reach
// Vexere more than once every CACHE_SECONDS.

import { extractRouteState, normalizeRoute } from "./parse.js";

const PATH_RE = /^bus-ticket-booking-from-[a-z0-9-]+-to-[a-z0-9-]+-\d+t\d+\.html$/;
const CACHE_SECONDS = 300;

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

async function fetchRoute(path) {
  const res = await fetch(`https://vexere.com/en-US/${path}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; vn-bus personal lookup)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`VEXERE_HTTP_${res.status}`);
  return normalizeRoute(extractRouteState(await res.text()));
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (url.pathname !== "/route") return json({ error: "NOT_FOUND" }, 404, cors);

    const path = url.searchParams.get("path") || "";
    if (!PATH_RE.test(path)) return json({ error: "BAD_PATH" }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.vn-bus/route/${path}`);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "X-Cache": "HIT", ...cors } });
    }

    try {
      const data = await fetchRoute(path);
      data.fetchedAt = new Date().toISOString();
      data.sourceUrl = `https://vexere.com/en-US/${path}`;
      const body = JSON.stringify(data);
      ctx.waitUntil(
        cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })),
      );
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "X-Cache": "MISS", ...cors } });
    } catch (err) {
      return json({ error: String(err.message || err) }, 502, cors);
    }
  },
};
