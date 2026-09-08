import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.DATABASE_PATH = ":memory:";

const { readGraph } = await import("../tree.js");
const { db } = await import("../db.js");
const { sendMessage } = await import("./eval-helpers.js");

beforeEach(() => db.exec("DELETE FROM people; DELETE FROM parent_of; DELETE FROM spouse_of;"));

test("add_person_and_find_handles_duplicate_names", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add a person named Maria born in 1975.");
  messages = m1.messages;

  let graph = readGraph();
  assert.equal(graph.people.length, 1);
  assert.equal(graph.people[0].name, "Maria");

  const m2 = await sendMessage(messages, "Add a person named Maria born in 1982.");
  messages = m2.messages;

  graph = readGraph();
  assert.equal(graph.people.length, 1, "Should still have 1 person before confirmation");

  const m3 = await sendMessage(messages, "Yes, add a second Maria.");
  messages = m3.messages;

  graph = readGraph();
  assert.equal(graph.people.length, 2);
  assert.deepEqual(
    graph.people.map((p) => p.name).sort(),
    ["Maria", "Maria"]
  );
});

test("find_person_returns_candidates_with_context", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add a person named Luis.");
  messages = m1.messages;

  const m2 = await sendMessage(messages, "Add another person also named Luis.");
  messages = m2.messages;

  let graph = readGraph();
  assert.equal(graph.people.length, 2);

  const m3 = await sendMessage(messages, "Tell me about Luis.");
  messages = m3.messages;

  graph = readGraph();
  assert.equal(graph.people.length, 2);
  assert.deepEqual(
    graph.people.map((p) => p.name).sort(),
    ["Luis", "Luis"]
  );
});
