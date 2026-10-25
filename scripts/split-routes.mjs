// Converts an older flat routes.json ([{path, from, to}, ...]) into site/routes/.
//   node scripts/split-routes.mjs path/to/routes.json
import { readFileSync } from "node:fs";
import { writeRoutes } from "./routes-lib.mjs";

const list = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outDir = new URL("../site/routes", import.meta.url).pathname;
console.log(writeRoutes(list.map((r) => r.path), outDir));
