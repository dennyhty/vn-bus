import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractRouteState, normalizeRoute } from "../src/parse.js";

const html = readFileSync(new URL("./fixtures/saigon-da-lat.html", import.meta.url), "utf8");

test("normalizes a Vexere route page", () => {
  const route = normalizeRoute(extractRouteState(html));
  assert.equal(route.from.name, "Sai Gon");
  assert.equal(route.to.name, "Da Lat");
  assert.equal(route.trips.length, 3);
  const t = route.trips[0];
  assert.equal(t.operator, "Đà Lạt ơi");
  assert.equal(t.vehicle, "VIP Cabin bus");
  assert.equal(t.departTime, "22:35");
  assert.equal(t.price, 370000);
  assert.equal(t.seatsLeft, 18);
  assert.equal(t.pickup.name, "Thanh Le Park Office");
  assert.ok(route.pickupPoints.length > 0);
  assert.equal(typeof route.pickupPoints[0].lat, "number");
  assert.ok(route.dropoffPoints.some((p) => p.name === "Prenn Pass"));
});

test("rejects pages without route data", () => {
  assert.throws(() => extractRouteState("<html></html>"), /NEXT_DATA_NOT_FOUND/);
});
