import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// Set before the import below, because db.js opens the database as it loads.
process.env.DATABASE_PATH = ":memory:";

const { db } = await import("./db.js");
const { addPerson, addParentEdge, addSpouseEdge, readGraph } = await import("./tree.js");

const idOf = (name) => addPerson({ name, confirmDuplicate: true }).person.id;

beforeEach(() => db.exec("DELETE FROM people"));

test("addPerson refuses a duplicate name and returns the namesakes", () => {
  const id = idOf("Juan");

  const refusal = addPerson({ name: "Juan" });
  assert.equal(refusal.ok, false);
  assert.deepEqual(refusal.namesakes.map((p) => p.id), [id]);

  const confirmed = addPerson({ name: "Juan", confirmDuplicate: true });
  assert.equal(confirmed.ok, true);
  assert.notEqual(confirmed.person.id, id);
});

test("addParentEdge refuses a third parent and returns both parents", () => {
  const [child, mother, father, other] = ["Ana", "Maria", "Juan", "Pedro"].map(idOf);
  addParentEdge(child, mother);
  addParentEdge(child, father);

  const refusal = addParentEdge(child, other);
  assert.equal(refusal.ok, false);
  assert.deepEqual(refusal.parents.map((p) => p.name).sort(), ["Juan", "Maria"]);
});

test("addParentEdge refuses a cycle and returns the path", () => {
  const [maria, juan, pedro] = ["Maria", "Juan", "Pedro"].map(idOf);
  addParentEdge(juan, maria);
  addParentEdge(pedro, juan);

  const short = addParentEdge(maria, juan);
  assert.equal(short.ok, false);
  assert.deepEqual(short.path, ["Maria", "Juan"]);

  const long = addParentEdge(maria, pedro);
  assert.equal(long.ok, false);
  assert.deepEqual(long.path, ["Maria", "Juan", "Pedro"]);

  assert.equal(readGraph().parentEdges.length, 2);
});

test("addParentEdge writes nothing for a known edge", () => {
  const [child, mother, father] = ["Ana", "Maria", "Juan"].map(idOf);

  assert.deepEqual(addParentEdge(child, mother), { ok: true, created: true });
  assert.deepEqual(addParentEdge(child, mother), { ok: true, created: false });

  // Still a no-op once the child has two parents, so a repeated turn does not
  // hit the two parent limit.
  addParentEdge(child, father);
  assert.deepEqual(addParentEdge(child, mother), { ok: true, created: false });
  assert.equal(readGraph().parentEdges.length, 2);
});

test("readGraph returns the client contract", () => {
  const [child, mother, father] = ["Ana", "Maria", "Juan"].map(idOf);
  addParentEdge(child, mother);
  addSpouseEdge(mother, father);

  const graph = readGraph();
  assert.deepEqual(Object.keys(graph).sort(), ["parentEdges", "people", "spouseEdges"]);
  assert.deepEqual(Object.keys(graph.people[0]).sort(), ["birthYear", "id", "name"]);
  assert.deepEqual(graph.parentEdges, [{ parentId: mother, childId: child }]);
  assert.equal(graph.spouseEdges.length, 1);
});
