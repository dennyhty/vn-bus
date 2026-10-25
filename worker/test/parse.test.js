import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractSeo, normalizeRoute } from "../src/parse.js";

// Trimmed from a real undated Vexere route page (Saigon -> Da Lat).
const html = readFileSync(new URL("./fixtures/saigon-da-lat.html", import.meta.url), "utf8");

test("normalizes the undated route page into a timetable", () => {
  const route = normalizeRoute(extractSeo(html));
  assert.equal(route.from.name, "Ho Chi Minh City");
  assert.equal(route.to.name, "Da Lat");
  assert.equal(route.totalOperators, 24);
  assert.equal(route.fareMin, 189000);
  assert.equal(route.operators.length, 3);

  const op = route.operators[0];
  assert.equal(op.name, "Da Lat oi");
  assert.deepEqual(op.times.slice(0, 2), ["22:20", "22:30"]);
  assert.equal(op.rating, 4.9);
  assert.ok(op.pickupPoints.length > 0);
  assert.match(op.pickupPoints[0].fullAddress, /Dĩ An/);
  assert.ok(op.dropoffPoints[0].fullAddress.length > 0);
});

test("attaches the sample trip and Vietnamese name when the operator has one", () => {
  const route = normalizeRoute(extractSeo(html));
  const withSample = route.operators.filter((o) => o.sample);
  for (const o of withSample) {
    assert.ok(o.sample.from.name);
    assert.equal(typeof o.sample.seatsLeft, "number");
  }
});

test("rejects pages without route data", () => {
  assert.throws(() => extractSeo("<html></html>"), /NEXT_DATA_NOT_FOUND/);
});
