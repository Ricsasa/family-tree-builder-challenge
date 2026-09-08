import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.DATABASE_PATH = ":memory:";

const { readGraph } = await import("../tree.js");
const { db } = await import("../db.js");
const { sendMessage } = await import("./eval-helpers.js");

beforeEach(() => db.exec("DELETE FROM people; DELETE FROM parent_of; DELETE FROM spouse_of;"));

test("add_parent_child_edge_writes_the_row", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add Maria.");
  messages = m1.messages;

  const m2 = await sendMessage(messages, "Add Juan.");
  messages = m2.messages;

  let graph = readGraph();
  const maria = graph.people.find((p) => p.name === "Maria");
  const juan = graph.people.find((p) => p.name === "Juan");

  assert(maria && juan, "Both people should exist");

  const m3 = await sendMessage(messages, "Maria is the parent of Juan.");
  messages = m3.messages;

  graph = readGraph();
  assert.equal(graph.parentEdges.length, 1);
  assert.deepEqual(graph.parentEdges[0], {
    parentId: maria.id,
    childId: juan.id
  });
});

test("add_two_parent_edges_and_refuse_third", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add Carlos.");
  messages = m1.messages;

  const m2 = await sendMessage(messages, "Add Rosa.");
  messages = m2.messages;

  const m3 = await sendMessage(messages, "Add Luis.");
  messages = m3.messages;

  const m4 = await sendMessage(messages, "Add Diego.");
  messages = m4.messages;

  let graph = readGraph();
  const carlos = graph.people.find((p) => p.name === "Carlos");
  const rosa = graph.people.find((p) => p.name === "Rosa");
  const luis = graph.people.find((p) => p.name === "Luis");
  const diego = graph.people.find((p) => p.name === "Diego");

  assert(carlos && rosa && luis && diego, "All four people should exist");

  const m5 = await sendMessage(messages, "Carlos is the parent of Luis.");
  messages = m5.messages;

  const m6 = await sendMessage(messages, "Rosa is the parent of Luis.");
  messages = m6.messages;

  graph = readGraph();
  assert.equal(graph.parentEdges.length, 2);

  const m7 = await sendMessage(messages, "Diego is the parent of Luis.");
  messages = m7.messages;

  graph = readGraph();
  assert.equal(graph.parentEdges.length, 2, "Should refuse the third parent");
});

test("add_spouse_edge_writes_the_row", async () => {
  let messages = [];

  const m1 = await sendMessage(messages, "Add Ana.");
  messages = m1.messages;

  const m2 = await sendMessage(messages, "Add Miguel.");
  messages = m2.messages;

  let graph = readGraph();
  const ana = graph.people.find((p) => p.name === "Ana");
  const miguel = graph.people.find((p) => p.name === "Miguel");

  assert(ana && miguel, "Both people should exist");

  const m3 = await sendMessage(messages, "Ana is married to Miguel.");
  messages = m3.messages;

  graph = readGraph();
  assert.equal(graph.spouseEdges.length, 1);
  const [edge] = graph.spouseEdges;
  const [first, second] = ana.id < miguel.id ? [ana.id, miguel.id] : [miguel.id, ana.id];
  assert.equal(edge.personAId, first);
  assert.equal(edge.personBId, second);
});
