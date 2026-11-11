import test from "node:test";
import assert from "node:assert/strict";
import { areQueueNamesEqual, normalizeQueueNames, QUEUE_NAME_MAX_LENGTH } from "../public/js/queue-names.js";

test("normalizeQueueNames keeps valid queue labels, trims them, and ignores empty or invalid entries", () => {
  assert.deepEqual(normalizeQueueNames({
    "6.2": "  Дім  ",
    "3.2": "Гараж",
    "7.1": "Invalid queue",
    "6.1": "   ",
    "2.1": 3,
  }), { "6.2": "Дім", "3.2": "Гараж" });
});

test("normalizeQueueNames limits names by Unicode characters, not UTF-16 units", () => {
  const emoji = "🟡".repeat(QUEUE_NAME_MAX_LENGTH + 2);
  assert.equal(Array.from(normalizeQueueNames({ "1.1": emoji })["1.1"]).length, QUEUE_NAME_MAX_LENGTH);
});

test("areQueueNamesEqual compares normalized names independent of input order or whitespace", () => {
  assert.equal(areQueueNamesEqual({ "6.2": " Дім ", "3.2": "Гараж" }, { "3.2": "Гараж", "6.2": "Дім" }), true);
  assert.equal(areQueueNamesEqual({ "6.2": "Дім" }, {}), false);
});
