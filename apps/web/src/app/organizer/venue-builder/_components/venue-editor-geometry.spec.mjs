import assert from "node:assert/strict";
import { test } from "node:test";

import { roomCoordinate } from "./venue-editor-geometry.ts";

test("half-metre drag snapping preserves physical room bounds", () => {
  assert.equal(roomCoordinate(2.26, 10, true), 2.5);
  assert.equal(roomCoordinate(2.24, 10, true), 2);
  assert.equal(roomCoordinate(9.8, 9.7, true), 9.7);
  assert.equal(roomCoordinate(-0.2, 10, true), 0);
});

test("unsnapped movement retains metre precision while staying inside the room", () => {
  assert.equal(roomCoordinate(2.26, 10, false), 2.26);
  assert.equal(roomCoordinate(11, 10, false), 10);
  assert.equal(roomCoordinate(4, -1, false), 0);
});
