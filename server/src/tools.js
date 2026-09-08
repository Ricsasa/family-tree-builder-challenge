import * as tree from "./tree.js";

export const toolDefinitions = [
  {
    name: "find_person",
    description:
      "Look up people by name. Returns every match, its relations and how many"
      + " matched. It never picks one. Call it before any write, because every"
      + " other tool takes ids. If it returns none or more than one, ask the"
      + " user which person they mean.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "The name to look up." } },
      required: ["name"],
    },
  },
  {
    name: "add_person",
    description:
      "Add a person to the tree. It refuses a name that someone already has,"
      + " and returns those people. Ask the user if it is the same person"
      + " before you call again with confirmDuplicate.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        birthYear: { type: "integer", description: "Tells people with one name apart." },
        confirmDuplicate: {
          type: "boolean",
          description: "Only after the user says this is a different person.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "add_parent",
    description:
      "Record that one person is the parent of another. A child takes at most"
      + " two parents, and an edge that would make a loop is refused.",
    input_schema: {
      type: "object",
      properties: {
        childId: {
          type: "string",
          description: "The id of the child, from find_person.",
        },
        parentId: {
          type: "string",
          description: "The id of the parent, from find_person.",
        },
      },
      required: ["childId", "parentId"],
    },
  },
  {
    name: "add_spouse",
    description:
      "Record that two people are married. This says nothing about children:"
      + " a marriage never makes a parent edge.",
    input_schema: {
      type: "object",
      properties: {
        personAId: {
          type: "string",
          description: "The id of one spouse, from find_person.",
        },
        personBId: {
          type: "string",
          description: "The id of the other spouse, from find_person.",
        },
      },
      required: ["personAId", "personBId"],
    },
  },
  {
    name: "rename_person",
    description:
      "Correct the name of a person who is already in the tree. Use it for a"
      + " misspelled name. It changes the row in place, so no relation is lost"
      + " and no second person appears.",
    input_schema: {
      type: "object",
      properties: {
        personId: {
          type: "string",
          description: "The id of the person to correct, from find_person.",
        },
        name: { type: "string", description: "The corrected name." },
      },
      required: ["personId", "name"],
    },
  },
  {
    name: "replace_parent",
    description:
      "Swap one parent of a child for another, in one step. Use it when the"
      + " user says a parent is somebody else. Do not remove and add instead:"
      + " a failure in between would leave the child with one parent less.",
    input_schema: {
      type: "object",
      properties: {
        childId: {
          type: "string",
          description: "The id of the child, from find_person.",
        },
        oldParentId: {
          type: "string",
          description: "The id of the parent to drop, from find_person.",
        },
        newParentId: {
          type: "string",
          description: "The id of the parent to record, from find_person.",
        },
      },
      required: ["childId", "oldParentId", "newParentId"],
    },
  },
  {
    name: "remove_parent",
    description:
      "Drop a parent edge, with nothing in its place. Use it when the user"
      + " says a recorded parent is wrong and names no replacement.",
    input_schema: {
      type: "object",
      properties: {
        childId: {
          type: "string",
          description: "The id of the child, from find_person.",
        },
        parentId: {
          type: "string",
          description: "The id of the parent, from find_person.",
        },
      },
      required: ["childId", "parentId"],
    },
  },
  {
    name: "remove_spouse",
    description: "Drop a marriage between two people.",
    input_schema: {
      type: "object",
      properties: {
        personAId: {
          type: "string",
          description: "The id of one spouse, from find_person.",
        },
        personBId: {
          type: "string",
          description: "The id of the other spouse, from find_person.",
        },
      },
      required: ["personAId", "personBId"],
    },
  },
  {
    name: "remove_person",
    description:
      "Remove a person from the tree. If the person is in any relation, it"
      + " refuses and returns those relations. Tell the user what would go,"
      + " then call again with confirmRemoveEdges.",
    input_schema: {
      type: "object",
      properties: {
        personId: {
          type: "string",
          description: "The id of the person to remove, from find_person.",
        },
        confirmRemoveEdges: {
          type: "boolean",
          description: "Only after the user agrees to lose the relations.",
        },
      },
      required: ["personId"],
    },
  },
];

const handlers = {
  find_person: ({ name }) => tree.findPerson(name),
  add_person: (input) => tree.addPerson(input),
  add_parent: ({ childId, parentId }) => tree.addParentEdge(childId, parentId),
  add_spouse: ({ personAId, personBId }) => tree.addSpouseEdge(personAId, personBId),
  rename_person: ({ personId, name }) => tree.renamePerson(personId, name),
  replace_parent: ({ childId, oldParentId, newParentId }) =>
    tree.replaceParent(childId, oldParentId, newParentId),
  remove_parent: ({ childId, parentId }) => tree.removeParentEdge(childId, parentId),
  remove_spouse: ({ personAId, personBId }) => tree.removeSpouseEdge(personAId, personBId),
  remove_person: ({ personId, confirmRemoveEdges }) =>
    tree.removePerson(personId, confirmRemoveEdges),
};

// Never throws to force the loop  to send a tool_result back
export function runTool(name, input) {
  const definition = toolDefinitions.find((tool) => tool.name === name);
  if (!definition) return { ok: false, error: `There is no tool called ${name}.` };

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: `${name} takes an object.` };
  }

  const missing = definition.input_schema.required.filter((field) => input[field] === undefined);
  if (missing.length > 0) {
    return { ok: false, error: `${name} needs ${missing.join(" and ")}.` };
  }

  try {
    return handlers[name](input);
  } catch (error) {
    return { ok: false, error: `${name} failed: ${error.message}` };
  }
}
