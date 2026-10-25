// Builds site/routes.json from Vexere's public sitemaps.
// Run on a machine that can reach vexere.com:  node scripts/build-routes.mjs
//
// Each entry is one English route page the Worker is allowed to fetch.

import { writeFileSync } from "node:fs";

const ROUTE_RE =
  /https:\/\/vexere\.com\/en-US\/(bus-ticket-booking-from-([a-z0-9-]+?)-to-([a-z0-9-]+)-\d+t\d+\.html)/g;
const MAX_SITEMAPS = 60;
const UA = "Mozilla/5.0 (compatible; vn-bus personal lookup)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function prettify(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const robots = await get("https://vexere.com/robots.txt");
const queue = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
const seen = new Set();
const routes = new Map();

while (queue.length && seen.size < MAX_SITEMAPS) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  let xml;
  try {
    xml = await get(url);
  } catch (err) {
    console.warn("skip", err.message);
    continue;
  }
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const loc = m[1];
    if (/\.xml(\.gz)?$/.test(loc)) queue.push(loc);
  }
  for (const m of xml.matchAll(ROUTE_RE)) {
    const [, path, from, to] = m;
    routes.set(path, { path, from: prettify(from), to: prettify(to) });
  }
  console.log(`${url}: ${routes.size} routes so far`);
  await sleep(500);
}

const list = [...routes.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
writeFileSync(new URL("../site/routes.json", import.meta.url), JSON.stringify(list, null, 1) + "\n");
console.log(`wrote ${list.length} routes`);
