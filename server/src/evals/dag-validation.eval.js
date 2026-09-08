import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.DATABASE_PATH = ":memory:";

const { readGraph } = await import("../tree.js");
const { db } = await import("../db.js");
const { sendMessage } = await import("./eval-helpers.js");

beforeEach(() => db.exec("DELETE FROM people; DELETE FROM parent_of; DELETE FROM spouse_of;"));

test("reject_cycle_in_parent_edges", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add Ana.");
  messages = m1.messages;

  const m2 = await sendMessage(messages, "Add Pedro.");
  messages = m2.messages;

  const m3 = await sendMessage(messages, "Add Clara.");
  messages = m3.messages;

  let graph = readGraph();
  const ana = graph.people.find((p) => p.name === "Ana");
  const pedro = graph.people.find((p) => p.name === "Pedro");
  const clara = graph.people.find((p) => p.name === "Clara");

  assert(ana && pedro && clara, "All three people should exist");

  const m4 = await sendMessage(messages, "Pedro is the parent of Ana.");
  messages = m4.messages;

  const m5 = await sendMessage(messages, "Clara is the parent of Pedro.");
  messages = m5.messages;

  graph = readGraph();
  assert.equal(graph.parentEdges.length, 2);

  const m6 = await sendMessage(messages, "Ana is the parent of Clara.");
  messages = m6.messages;

  graph = readGraph();
  assert.equal(graph.parentEdges.length, 2, "Should reject the cycle");
});
