import { db } from "./db.js";

const sql = {
  personById: db.prepare(
    "SELECT id, name, birth_year AS birthYear FROM people WHERE id = ?",
  ),
  peopleNamed: db.prepare(
    "SELECT id, name, birth_year AS birthYear FROM people WHERE name = ? ORDER BY created_at, id",
  ),
  insertPerson: db.prepare(
    "INSERT INTO people (id, name, birth_year) VALUES (?, ?, ?)",
  ),
  parentIdsOf: db.prepare("SELECT parent_id FROM parent_of WHERE child_id = ?"),
  parentEdge: db.prepare(
    "SELECT 1 FROM parent_of WHERE child_id = ? AND parent_id = ?",
  ),
  insertParentEdge: db.prepare(
    "INSERT INTO parent_of (child_id, parent_id) VALUES (?, ?)",
  ),
  insertSpouseEdge: db.prepare(
    "INSERT OR IGNORE INTO spouse_of (person_a_id, person_b_id) VALUES (?, ?)",
  ),
  allPeople: db.prepare(
    "SELECT id, name, birth_year AS birthYear FROM people ORDER BY created_at, id",
  ),
  allParentEdges: db.prepare(
    "SELECT parent_id AS parentId, child_id AS childId FROM parent_of",
  ),
  allSpouseEdges: db.prepare(
    "SELECT person_a_id AS personAId, person_b_id AS personBId FROM spouse_of",
  ),
};

export const transaction = (fn) => db.transaction(fn);

export const personById = (id) => sql.personById.get(id);

export const peopleNamed = (name) => sql.peopleNamed.all(name);

export const insertPerson = (id, name, birthYear) => {
  sql.insertPerson.run(id, name, birthYear);
};

export const parentIdsOf = (childId) =>
  sql.parentIdsOf.all(childId).map((row) => row.parent_id);

export const hasParentEdge = (childId, parentId) =>
  sql.parentEdge.get(childId, parentId) !== undefined;

export const insertParentEdge = (childId, parentId) => {
  sql.insertParentEdge.run(childId, parentId);
};

// The table holds one fixed order, so the same couple in reverse is one row.
// Answers whether this call is the one that wrote it.
export const insertSpouseEdge = (personAId, personBId) => {
  const [first, second] = personAId < personBId
    ? [personAId, personBId]
    : [personBId, personAId];
  return sql.insertSpouseEdge.run(first, second).changes === 1;
};

export const allPeople = () => sql.allPeople.all();

export const allParentEdges = () => sql.allParentEdges.all();

export const allSpouseEdges = () => sql.allSpouseEdges.all();
