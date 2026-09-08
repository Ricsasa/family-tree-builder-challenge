import { randomUUID } from "node:crypto";

import * as store from "./data/store.js";

// Walks up from the proposed parent. Returns the path, child first, when the
// new edge would close a loop, or null when the edge is safe.
function cyclePath(childId, parentId) {
  const seen = new Set();
  const paths = [[parentId]];

  while (paths.length > 0) {
    const path = paths.pop();
    const id = path[path.length - 1];

    if (id === childId) return path.reverse();
    if (seen.has(id)) continue;
    seen.add(id);

    for (const ancestor of store.parentIdsOf(id)) paths.push([...path, ancestor]);
  }

  return null;
}

export function addPerson({ name, birthYear = null, confirmDuplicate = false }) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName === "") return { ok: false, error: "A person needs a name." };

  const existing = store.peopleNamed(cleanName);
  if (existing.length > 0 && !confirmDuplicate) {
    return {
      ok: false,
      error: `The tree already holds ${existing.length} ${existing.length === 1 ? "person" : "people"} with the name ${cleanName}. Ask the user if this is the same person. To add another one, call again with confirmDuplicate.`,
      existing,
    };
  }

  const id = randomUUID();
  store.insertPerson(id, cleanName, birthYear);
  return { ok: true, person: { id, name: cleanName, birthYear } };
}

export const addParentEdge = store.transaction((childId, parentId) => {
  const child = store.personById(childId);
  const parent = store.personById(parentId);
  if (!child) return { ok: false, error: `No person has the id ${childId}.` };
  if (!parent) return { ok: false, error: `No person has the id ${parentId}.` };
  if (childId === parentId) {
    return { ok: false, error: `${child.name} cannot be the parent of ${child.name}.` };
  }

  // Before the limit below, so a repeated turn about a child who already has
  // two parents is a no-op and not a refusal.
  if (store.hasParentEdge(childId, parentId)) return { ok: true, created: false };

  const parents = store.parentIdsOf(childId).map(store.personById);
  if (parents.length >= 2) {
    return {
      ok: false,
      error: `${child.name} already has two parents: ${parents.map((p) => p.name).join(" and ")}. Ask the user which one ${parent.name} replaces.`,
      parents,
    };
  }

  const cycle = cyclePath(childId, parentId);
  if (cycle) {
    const path = cycle.map((id) => store.personById(id).name);
    return {
      ok: false,
      error: `${child.name} is already an ancestor of ${parent.name} (${path.join(" > ")}). This edge would make a loop.`,
      path,
    };
  }

  store.insertParentEdge(childId, parentId);
  return { ok: true, created: true };
});

export const addSpouseEdge = store.transaction((personAId, personBId) => {
  const personA = store.personById(personAId);
  const personB = store.personById(personBId);
  if (!personA) return { ok: false, error: `No person has the id ${personAId}.` };
  if (!personB) return { ok: false, error: `No person has the id ${personBId}.` };
  if (personAId === personBId) {
    return { ok: false, error: `${personA.name} cannot be the spouse of ${personA.name}.` };
  }

  return { ok: true, created: store.insertSpouseEdge(personAId, personBId) };
});

export function readGraph() {
  return {
    people: store.allPeople(),
    parentEdges: store.allParentEdges(),
    spouseEdges: store.allSpouseEdges(),
  };
}

// Anyone who shares a parent, minus the person. The map drops the repeat when
// two people share both parents.
function siblingsOf(personId, parentIds) {
  const siblings = new Map();
  for (const parentId of parentIds) {
    for (const childId of store.childIdsOf(parentId)) {
      if (childId !== personId) siblings.set(childId, store.personById(childId));
    }
  }
  return [...siblings.values()];
}

export function findPerson(name) {
  const cleanName = typeof name === "string" ? name.trim() : "";

  const candidates = store.peopleNamed(cleanName).map((person) => {
    const parentIds = store.parentIdsOf(person.id);
    return {
      ...person,
      parents: parentIds.map(store.personById),
      children: store.childIdsOf(person.id).map(store.personById),
      spouses: store.spouseIdsOf(person.id).map(store.personById),
      siblings: siblingsOf(person.id, parentIds),
    };
  });

  return { matchCount: candidates.length, candidates };
}
