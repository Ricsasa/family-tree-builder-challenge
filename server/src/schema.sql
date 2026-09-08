
CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- criteria for desambiguation
  birth_year INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parent_of (
  child_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  PRIMARY KEY (child_id, parent_id),

  CHECK (parent_id <> child_id)
);

CREATE TABLE IF NOT EXISTS spouse_of (
  person_a_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  PRIMARY KEY (person_a_id, person_b_id),

  CHECK (person_a_id < person_b_id)
);
