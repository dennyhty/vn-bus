// Builds site/routes/ from Vexere's public English route sitemaps.
// Run on a machine that can reach vexere.com:  node scripts/build-routes.mjs
//
// vexere.com/sitemap.xml -> route-en.xml -> route-en/route-en-N.xml (about 12 files).
// robots.txt has no Sitemap line, so we start from sitemap.xml directly.

import { ROUTE_RE, writeRoutes } from "./routes-lib.mjs";

const UA = "Mozilla/5.0 (compatible; vn-bus personal lookup)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

const root = locs(await get("https://vexere.com/sitemap.xml"));
const routeIndex = root.find((u) => /\/route-en\.xml$/.test(u));
if (!routeIndex) throw new Error("route-en.xml not found in sitemap.xml");

const children = locs(await get(routeIndex));
console.log(`${children.length} route sitemaps`);

const paths = [];
for (const url of children) {
  const xml = await get(url);
  for (const loc of locs(xml)) {
    const m = loc.match(/\/en-US\/(bus-ticket-booking-[^/]+\.html)$/);
    if (m && ROUTE_RE.test(m[1])) paths.push(m[1]);
  }
  console.log(`${url}: ${paths.length} routes so far`);
  await sleep(500);
}

const outDir = new URL("../site/routes", import.meta.url).pathname;
console.log(writeRoutes(paths, outDir));
