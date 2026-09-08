import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// Set before the import below, because db.js opens the database as it loads.
process.env.DATABASE_PATH = ":memory:";

const { db } = await import("./db.js");
const { addPerson, addParentEdge, addSpouseEdge, readGraph, renamePerson, replaceParent, removePerson, } = await import("./tree.js");

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

test("findPerson returns every person with that name and a match count", () => {
    const older = addPerson({ name: "Juan", birthYear: 1970 }).person.id;
    const younger = addPerson({ name: "Juan", birthYear: 1998, confirmDuplicate: true }).person.id;
    addParentEdge(younger, older);

    const answer = findPerson("Juan");
    assert.equal(answer.matchCount, 2);
    assert.deepEqual(answer.candidates.map((c) => c.id).sort(), [older, younger].sort());

    const father = answer.candidates.find((c) => c.id === older);
    assert.deepEqual(father.children.map((c) => c.name), ["Juan"]);
    assert.deepEqual(father.parents, []);
});

test("findPerson returns the siblings that shared parents make", () => {
    const [mother, father] = [addPerson({ name: "Maria" }), addPerson({ name: "Luis" })]
        .map((answer) => answer.person.id);
    const rosa = addPerson({ name: "Rosa" }).person.id;
    const pedro = addPerson({ name: "Pedro" }).person.id;
    for (const child of [rosa, pedro]) {
        addParentEdge(child, mother);
        addParentEdge(child, father);
    }

    const [candidate] = findPerson("Rosa").candidates;
    assert.deepEqual(candidate.siblings.map((s) => s.name), ["Pedro"]);
});

test("findPerson answers a name nobody has with no matches", () => {
    assert.deepEqual(findPerson("Nobody"), { matchCount: 0, candidates: [] });
});

test("renamePerson corrects the name in place and keeps every edge", () => {
    const [child, mother, father] = ["Karla", "Ana", "Beto"].map(idOf);
    addParentEdge(child, mother);
    addParentEdge(child, father);
    addSpouseEdge(mother, father);

    const answer = renamePerson(child, "Carla");
    assert.equal(answer.ok, true);
    assert.equal(answer.person.name, "Carla");

    const graph = readGraph();
    assert.equal(graph.people.filter((p) => p.name === "Karla").length, 0);
    assert.equal(graph.people.length, 3);
    assert.equal(graph.parentEdges.filter((e) => e.childId === child).length, 2);
    assert.equal(graph.spouseEdges.length, 1);
});

test("replaceParent swaps one parent and leaves the other alone", () => {
    const [child, mother, oldFather, newFather] = ["Ivan", "Ana", "Luis", "Dani"].map(idOf);
    addParentEdge(child, mother);
    addParentEdge(child, oldFather);

    const answer = replaceParent(child, oldFather, newFather);
    assert.equal(answer.ok, true);

    const parents = readGraph().parentEdges
        .filter((e) => e.childId === child)
        .map((e) => e.parentId);
    assert.deepEqual(parents.sort(), [mother, newFather].sort());
});

test("replaceParent keeps the old parent when the new edge is refused", () => {
    const [child, oldParent] = ["Ana", "Beto"].map(idOf);
    addParentEdge(child, oldParent);

    // The child is an ancestor of this candidate, so the new edge closes a loop.
    const grandchild = idOf("Eva");
    addParentEdge(grandchild, child);

    const answer = replaceParent(child, oldParent, grandchild);
    assert.equal(answer.ok, false);
    assert.deepEqual(answer.path, ["Ana", "Eva"]);

    const parents = readGraph().parentEdges
        .filter((e) => e.childId === child)
        .map((e) => e.parentId);
    assert.deepEqual(parents, [oldParent]);
});

test("removePerson refuses while relations exist and names them", () => {
    const [person, parent, child] = ["Uma", "Tom", "Vic"].map(idOf);
    addParentEdge(person, parent);
    addParentEdge(child, person);

    const refusal = removePerson(person);
    assert.equal(refusal.ok, false);
    assert.deepEqual(refusal.edges.parents.map((p) => p.name), ["Tom"]);
    assert.deepEqual(refusal.edges.children.map((p) => p.name), ["Vic"]);
    assert.equal(readGraph().people.length, 3);

    const confirmed = removePerson(person, true);
    assert.equal(confirmed.ok, true);

    const graph = readGraph();
    assert.equal(graph.people.length, 2);
    assert.equal(graph.parentEdges.length, 0);
});

