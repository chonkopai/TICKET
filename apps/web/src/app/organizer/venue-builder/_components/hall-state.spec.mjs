import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeSeats, hallEditorSchema, newHallObject } from "@event-platform/shared-types";
import { moveRoundSeatOnOrbit, ROUND_SEAT_ARC_METRES, updateObject } from "./hall-state.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function roundTable(seats = 5) {
  const table = { ...newHallObject(id(1), "table_round", 5, 5), height: 1.6 };
  const objects = [table, ...Array.from({ length: seats }, (_, index) => ({ ...newHallObject(id(index + 2), "seat", 5, 5), parentId: table.id, attachedOrder: index }))];
  return { room: { widthM: 12, heightM: 12 }, editor: arrangeSeats({ version: 1, objects, tariffs: [] }, table.id) };
}

test("a round seat follows the orbit and keeps its angle when its table moves", () => {
  const original = roundTable();
  const moved = moveRoundSeatOnOrbit(original, id(2), { x: 6, y: 4 });
  const table = moved.editor.objects[0];
  const seat = moved.editor.objects.find((o) => o.id === id(2));
  assert.ok(seat.orbitAngle !== undefined);
  assert.equal(seat.parentId, table.id);
  assert.ok(Math.abs(Math.hypot(seat.x - table.x, seat.y - table.y) - (table.width / 2 + table.seatOffset)) < .02);
  assert.equal(hallEditorSchema.safeParse(moved.editor).success, true);
  const relocated = updateObject(moved, table.id, { x: 7, y: 7 });
  const relocatedSeat = relocated.editor.objects.find((o) => o.id === id(2));
  assert.equal(relocatedSeat.orbitAngle, seat.orbitAngle);
  assert.ok(Math.abs((relocatedSeat.x - seat.x) - 2) < .02);
  assert.ok(Math.abs((relocatedSeat.y - seat.y) - 2) < .02);
});

test("a seat stops before crossing a neighboring seat's 40 cm arc", () => {
  const initial = roundTable(5);
  const moved = moveRoundSeatOnOrbit(initial, id(2), { x: 8, y: 4.5 });
  const first = moved.editor.objects.find((o) => o.id === id(2));
  const next = moved.editor.objects.find((o) => o.id === id(3));
  const table = moved.editor.objects[0];
  const radius = table.width / 2 + table.seatOffset;
  const arc = ((next.orbitAngle - first.orbitAngle + 360) % 360) * Math.PI / 180 * radius;
  assert.ok(arc >= ROUND_SEAT_ARC_METRES - .01, `arc was ${arc} m`);
  assert.ok(arc < 1);
});

test("a seat cannot be dragged into a neighboring table", () => {
  const initial = roundTable(1);
  const obstacle = { ...newHallObject(id(8), "table_round", 6, 5), height: 1.6 };
  const withObstacle = { ...initial, editor: { ...initial.editor, objects: [...initial.editor.objects, obstacle] } };
  const moved = moveRoundSeatOnOrbit(withObstacle, id(2), { x: 6.2, y: 5 });
  const seat = moved.editor.objects.find((o) => o.id === id(2));
  assert.ok(Math.hypot(seat.x - obstacle.x, seat.y - obstacle.y) >= obstacle.width / 2 + seat.width / 2 - .02);
  assert.ok(seat.x < 6.1, `seat crossed into adjacent table at x=${seat.x}`);
});
