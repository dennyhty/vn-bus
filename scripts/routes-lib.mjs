// Writes the route list as one small file per origin, so the browser only
// downloads the destinations of the origin the user picked.
//
//   site/routes/index.json        [{ name, file, count }]  one entry per origin
//   site/routes/<file>.json       [[destinationName, path], ...]

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

export const ROUTE_RE =
  /bus-ticket-booking-from-([a-z0-9-]+?)-to-([a-z0-9-]+)-\d+t\d+\.html/;

export function prettify(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// paths: array of "bus-ticket-booking-from-<from>-to-<to>-<ids>.html"
export function writeRoutes(paths, outDir) {
  const byOrigin = new Map();
  for (const path of new Set(paths)) {
    const m = path.match(ROUTE_RE);
    if (!m) continue;
    const [, from, to] = m;
    if (!byOrigin.has(from)) byOrigin.set(from, []);
    byOrigin.get(from).push([prettify(to), path]);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const index = [];
  for (const [from, list] of byOrigin) {
    list.sort((a, b) => a[0].localeCompare(b[0]));
    writeFileSync(`${outDir}/${from}.json`, JSON.stringify(list));
    index.push({ name: prettify(from), file: from, count: list.length });
  }
  index.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(`${outDir}/index.json`, JSON.stringify(index));
  return { origins: index.length, routes: [...byOrigin.values()].reduce((n, l) => n + l.length, 0) };
}
