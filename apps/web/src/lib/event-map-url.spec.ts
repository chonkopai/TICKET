import assert from "node:assert/strict";
import { test } from "node:test";
import { eventMapUrl } from "./event-map-url";

test("maps use the saved event pin even when the address is ambiguous", () => {
  const url = new URL(eventMapUrl({ address: "ewf", coordinates: { latitude: 43.238, longitude: 76.927 } })!);
  assert.equal(url.searchParams.get("query"), "43.238,76.927");
  assert.equal(new URL(eventMapUrl({ address: "", coordinates: { latitude: 0, longitude: 0 } })!).searchParams.get("query"), "0,0");
});

test("legacy events use their address and missing locations have no map link", () => {
  assert.equal(new URL(eventMapUrl({ address: " Алматы, Абая 44 " })!).searchParams.get("query"), "Алматы, Абая 44");
  assert.equal(eventMapUrl({ address: " ", coordinates: null }), null);
  assert.equal(new URL(eventMapUrl({ address: "Venue", coordinates: { latitude: 91, longitude: 0 } })!).searchParams.get("query"), "Venue");
});
