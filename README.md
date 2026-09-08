# Family Tree Builder — Take-Home Starter

This repo is a starting point, not a finished app. It gives you a working chat
UI, a working graph visualization, and a bare LLM connection with no tools
attached. Your job is everything that turns a conversation into a correct,
persisted family tree.

## What's already here

- **`client/`** — React (Vite) app with two panels:
  - `ChatPanel` — a text chat interface. Sends the full conversation to
    `POST /api/chat` on every turn and renders the reply.
  - `GraphView` — renders whatever `GET /api/graph` returns using
    [React Flow](https://reactflow.dev). It expects:
    ```
    {
      people: [{ id, name, ... }],
      parentEdges: [{ parentId, childId }],
      spouseEdges: [{ personAId, personBId }]
    }
    ```
    It lays nodes out by generation and re-fetches on an interval, so once
    your backend actually persists data, it'll show up here without any
    frontend changes.
- **`server/`** — Express app with:
  - `POST /api/chat` — stateless proxy to the model (`server/src/llm/client.js`,
    `server/src/routes/chat.js`). No tools are wired up. It can already hold a
    plain-text conversation and ask clarifying questions, but it has no way to
    read or write structured family-tree data.
  - `GET /api/graph` — currently always returns an empty graph
    (`server/src/routes/graph.js`). There is no database yet.

## What you need to build

1. **Tool definitions** the model uses to read/write the family tree (add
   person, add parent/child edge, add spouse edge, look up a person, apply a
   correction, etc. — you choose the shape).
2. **The agentic loop** in `POST /api/chat`: send messages + tools to the
   model, handle `tool_use` blocks, execute them against your persistence
   layer, feed `tool_result` blocks back, and repeat until the model returns
   plain text.
3. **A persistence layer** (SQLite is fine) that survives a process restart.
   `GET /api/graph` should read from it instead of returning the empty stub.
4. **Ambiguity and correction handling**:
   - If a reference is ambiguous (e.g. "my brother John" when two Johns
     exist), the agent should ask a clarifying question rather than guess.
   - If the user corrects an earlier statement (a misspelled name, a
     misstated relationship), state should update in place — not gain a
     duplicate or contradictory fact.
5. **DAG validation** — a parent→child edge that would create a cycle must be
   rejected, not silently accepted.

### Data model requirements

- **Person**: `id`, `name`, plus any other attributes you think are useful —
  justify your choices in your README.
- **Parent → Child**: single-direction, at most 2 parent edges per child.
- **Spouse**: explicit, undirected, distinct from parent→child. A spouse
  relationship alone never creates a parent edge.
- The graph must stay a valid DAG with respect to parent→child edges.

### Out of scope

Remarriage, half-siblings, more than 2 recorded parents, and unknown/missing
parents are out of scope. If a description happens to touch one of these, a
non-crashing response (clarifying question or a stated limitation) is fine —
you don't need to model it correctly.

## Getting started

```bash
npm install
cp server/.env.example server/.env   # then fill in ANTHROPIC_API_KEY
npm run dev
```

This starts the server (`:3001`) and client (`:5173`, proxying `/api` to the
server) together. Open the client URL and start chatting.

## Deliverables

- Your implementation (tool schema, agent loop, persistence, validation).
- A README section (append to this file or add a new one) covering:
  - Your tool schema and why you designed it that way
  - How you resolve ambiguous references and in-place corrections
  - Known limitations
- Be ready to walk through your design decisions and trade-offs in a follow-up
  discussion — not just demo the working app.


---

## Candidate Solution

A chatbot that builds and maintains a family tree through conversation.
The bot asks clarifying questions when names are ambiguous, updates facts in place, and rejects changes that would break the data structure.

### Overview

This project implements the agent loop that turns conversation into a correct family tree.
A system prompt and nine tools let Claude read and write family relationships.
The agent runs in the backend while the frontend stays unchanged.

### Tool schema and rationale

| Tool | Input | Output |
| --- | --- | --- |
| `find_person` | `name` | `{ matchCount, candidates }` |
| `add_person` | `name`, `birthYear?`, `confirmDuplicate?` | `{ ok, person }` |
| `add_parent` | `childId`, `parentId` | `{ ok, created }` |
| `add_spouse` | `personAId`, `personBId` | `{ ok, created }` |
| `rename_person` | `personId`, `name` | `{ ok, person }` |
| `replace_parent` | `childId`, `oldParentId`, `newParentId` | `{ ok, created }` |
| `remove_parent` | `childId`, `parentId` | `{ ok, removed }` |
| `remove_spouse` | `personAId`, `personBId` | `{ ok, removed }` |
| `remove_person` | `personId`, `confirmRemoveEdges?` | `{ ok, removed }` |

#### Why this schema

**No name in writes.** Every write takes only ids, which the model gets from `find_person`. If `find_person` returns zero or many matches, the model has no id and must ask the user. Guessing becomes impossible.

**`find_person` returns context.** Each candidate carries its parents, children, spouses, and siblings.
The agent can ask "the Juan born in 1970, or the one born in 1945?" in one turn.

**`replace_parent` is one tool.** "My father is not Juan, it is Pedro" needs one atomic move.
If you split it into remove and add, the child can lose a parent if the second call fails.

**`add_person` refuses duplicates.** A name that already exists in the tree is refused unless the user confirms it is a different person.
This prevents the model from creating its way out of ambiguity.

**Composite primary keys.** The database cannot hold a duplicate fact.
The same `add_parent` call made twice is a no-op.

**Idempotency flags.** Write tools return `created` and `removed` flags.
`add_parent(childId, parentId)` returns `{ ok: true, created: false }` if the edge already exists.
The agent can tell the user what really happened.

### Ambiguity resolution

The rule is simple: guessing is impossible by design.

Four things make this work:

1. **Identity is the id.** The server creates a UUID for every person, so the model never needs to create one.
2. **Every write takes ids only.** No write accepts a name, so there is no way to write by name.
3. **`find_person` is the only source of ids.** It returns every match without picking a winner.
4. **`add_person` refuses duplicates.** It returns the existing people with that name, and the refusal only goes away when the user confirms it is a different person.

When the user says "add John," the agent calls `find_person("John")`. If zero or many people match, the model has no id and must ask which person the user means or if it is someone new.

Each match includes parents, children, spouses, and siblings. So the agent can ask "The John born in 1970 (son of Maria and Carlos), or the John born in 1945?" and the user can answer without another lookup needed.

### In-place corrections

A correction changes a row without creating a duplicate or breaking relations.

**Rename.** `rename_person(personId, newName)` changes the name and timestamp in one statement. No edges move because every edge points at the id, which never changes.

**Replace parent.** `replace_parent(childId, oldParentId, newParentId)` removes one parent edge and adds another in a single atomic move. The old edge goes first, and if the new edge fails (due to a cycle, existing edge, or missing person), the old parent stays and nothing changes.

**Remove parent.** `remove_parent(childId, parentId)` removes one edge with no replacement.

**Remove person.** `remove_person(personId)` checks the person's relations first. If any exist, it refuses and shows them, then the refusal goes away when the user confirms the relations should go too. The edges then delete automatically.

### DAG validation

The graph cannot have loops in parent edges, and an edge that would create a loop is rejected before it is written.

The check walks up from the new parent and if it reaches the child, a loop exists. It returns the path so the user understands the rejection.

Example: "Maria's father is Juan. Juan's father is Maria." On the second statement, the check walks up from Maria and finds Maria again, returning the path `["Maria", "Juan"]`.

The check runs in JavaScript instead of SQL because the agent must name the path when it rejects an edge, and a SQL error names nothing. The check holds the path and uses a visited set to stop early, even if the database already contains a loop.

A person as their own parent is caught by a SQL constraint.

### Known limitations

**Name lookup is case-sensitive.** `find_person("juan")` and `find_person("Juan")` search differently. Add `.toLowerCase()` at the lookup site to fix this.

**Remarriage is out of scope.** If the user says "Maria was married to Juan, then to Pedro," both marriages are recorded. There is no way to know which one is current or when one ended. The agent states this as a limit and does not invent a model for it.

**Half-siblings exist but are not modeled.** Two people who share one parent but not both will naturally exist in the tree. They are not marked or treated as half-siblings because siblings are derived from shared parents at read time, not stored as a relation.

**At most two parents.** A child can have at most two recorded parents, and a third parent is refused.

**Missing parents are normal.** A person with no parents or one parent is a normal state, not an error. The agent does not create placeholder people for missing parents.

**Corrections are not versioned.** A correction overwrites the old value instead of keeping it.

**Earlier tool calls are not re-sent.** The conversation sent to the model is plain text, so tool calls and results die after their turn. The agent cannot see it already looked up a person and may call `find_person` twice for the same name. The system prompt says to trust earlier work, but this is incomplete.

**No request idempotency.** A retry of the same request can duplicate a person if the model already has `confirmDuplicate` in mind. The refusal in `add_person` covers the first call but not the confirmed one. Fixing this needs a request key, which is not worth the cost for one process and one tree.

**Siblings can marry.** The tree does not prevent siblings from marrying because there is no constraint on `add_spouse`. The validation would need to check shared parents, which is complex in SQL. The agent should ask a clarifying question if this comes up.

### Reliability

**Composite primary keys prevent duplicates.** A second `add_parent(childId, parentId)` call finds the edge already exists and returns `{ ok: true, created: false }`, so the tree gains no duplicate.

**Write transactions do not nest.** One tool call runs one transaction, so if a turn dies after two of three writes, those two remain in place. Each write is consistent on its own.

**The agent reports what happened.** A tool returns `{ ok, created }` or `{ ok, removed }` with context, so the agent can tell the user what is real, like "That parent was already saved" or "That relation is gone."

**Model retries are safe.** The SDK retries on 408, 409, 429, and 5xx errors happen before an answer exists, so they never run a tool twice.

**Round-trip limit prevents runaway loops.** The agent gets at most ten model round trips per request. The unit is round trips, not tool calls, because one model call can carry several. Crossing the limit ends the turn with an error.

### Architecture

```
server/
  src/
    data/
      schema.sql       — Database schema and constraints
      store.js         — Raw SQL queries
      db.js            — Database connection and schema setup
    tree.js            — Domain logic (add person, edges, validation)
    tree.test.js       — Unit tests
    tools.js           — Tool definitions and dispatcher
    routes/
      chat.js          — POST /api/chat endpoint
      graph.js         — GET /api/graph endpoint
    llm/
      client.js        — Agentic loop and system prompt
    metrics.js         — Counters and GET /api/metrics endpoint
    evals/
      *.eval.js        — Agent evals (4 evals)
      eval-helpers.js  — sendMessage utility for evals
    index.js           — Server setup
```

**Why `better-sqlite3`.** Node's built-in `:sqlite` prints a warning, so we use one dependency to get a clean API and clean output.

**Why `node:test` and `node:assert`.** No test framework dependency is needed. Test frameworks add rich messages this code does not need. A test name says what the function does, like `addParentEdge refuses a cycle and returns the path`. The output is `ok <n> - <name>`.

### Testing and Evals

**Unit tests** (`npm test -w server`) verify tree manipulation functions in `server/src/tree.test.js`:

| Test | Purpose |
| --- | --- |
| `addPerson refuses a duplicate name` | Reject duplicate names unless confirmed |
| `addParentEdge refuses a third parent` | Enforce two-parent limit and return both parents |
| `addParentEdge refuses a cycle` | Reject cycles and return the path |
| `addParentEdge writes nothing for a known edge` | Idempotent duplicate writes |
| `readGraph returns the client contract` | Graph structure matches API contract |
| `findPerson returns matches and context` | Return all matching people with relations |
| `findPerson returns siblings` | Compute siblings from shared parents |
| `findPerson answers no matches` | Return empty for unknown names |
| `renamePerson corrects the name in place` | Update name without duplicating |
| `replaceParent swaps one parent` | Atomic parent replacement |
| `replaceParent keeps old parent on error` | Transaction safety when new edge fails |
| `removePerson refuses while relations exist` | Confirm before deleting connected people |

**Evals** call the real model and measure agent behavior across scenarios. Because evals consume tokens and take time, they separate into three categories:

**`npm run eval:ambiguity -w server`** (`server/src/evals/ambiguity.eval.js`):
- `add_person_and_find_handles_duplicate_names`
- `find_person_returns_candidates_with_context`

**`npm run eval:dag -w server`** (`server/src/evals/dag-validation.eval.js`):
- `reject_cycle_in_parent_edges`

**`npm run eval:relations -w server`** (`server/src/evals/relations.eval.js`):
- `add_parent_child_edge_writes_the_row`
- `add_two_parent_edges_and_refuse_third`
- `add_spouse_edge_writes_the_row`

Run `npm run eval -w server` to execute all evals together.

### Metrics

`GET /api/metrics` returns these counters:

- `tree_people_total` — people added
- `tree_edges_parent_total` — parent edges added
- `tree_edges_spouse_total` — spouse edges added
- `tree_cycles_rejected_total` — rejected cycles
- `llm_input_tokens_total` — tokens sent to the model
- `llm_output_tokens_total` — tokens received from the model
- `roundTripLimitCrossed` — turns that hit the ten-round-trip limit

A turn that hits the round-trip limit is an error state, so this counter should always read zero.

A live metrics panel in the header shows people, parent edges, spouse edges, and token usage. The panel updates when the graph changes.

### Next steps

**Case-insensitive lookup.** Add `.toLowerCase()` to the name lookup so "Juan" and "juan" match the same person.

**Server-side history.** Store the full conversation with tool calls and results on the server and resend it instead of plain text. This would reduce model round trips but needs a conversation id and adds server state.

**Better cycle messages.** Show the cycle path as plain text instead of JSON.

**Index edges.** Add an index on parent lookups when the tree grows large.

**System prompt fix.** One line in the system prompt can stop the agent from naming tool names like "replace_parent" to users.

**Idempotency key.** Edges are idempotent via composite keys, but people are not. A request key would prevent duplicate people on retry, but saving request ids costs more than it gains for one process.

**Persistent metrics.** Send counters to a time-series database and set up alerting on `roundTripLimitCrossed` and other thresholds.
