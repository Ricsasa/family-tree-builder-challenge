import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, runTool } from "../tools.js";
import { increment } from "../metrics.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const REQUEST_OPTIONS = { maxRetries: 2, timeout: 30_000 };

const MAX_ROUND_TRIPS = 10;

export const counters = { roundTripLimitCrossed: 0 };

const LIMIT_REPLY = `I stopped this turn after ten steps, because I kept working without
reaching an answer. Anything I recorded is in the tree. Please tell me
the same thing in smaller steps.`;

const SYSTEM_PROMPT = `You help the user record their family tree in conversation.
The tree is the truth. Answer a question about it from find_person, never from the conversation alone. After a write, tell the user what you recorded, in their own words.
Never assume which person a name means. find_person is the only source of ids. If it returns no match, or more than one, ask the user which person they mean.
These are out of scope: remarriage, half siblings, more than two parents, and unknown or missing parents. When the user brings one up, say plainly that the tree cannot record it, or ask a question. Never invent a person or a relation to fill the gap.
Earlier assistant turns in this conversation did call tools, even though the conversation only shows their text. Never say you recorded something unless a tool result in this turn says so. If you called no tool, you changed nothing.

Missing parents are the normal state, not a gap because a person with no recorded parent, or with one, is a correct tree. Only say the limitation when the user raises the unknown parent.`;
/**
 * Sends a conversation to the model and returns its plain-text reply.
 * Runs an agentic loop: if the model responds with tool_use blocks, the
 * requested tools are executed and their results are fed back until the
 * model returns a plain text reply.
 *
 * @param {Array<{role: "user" | "assistant", content: string}>} messages
 * @returns {Promise<string>}
 */
export async function getChatReply(messages) {
  console.error("%%%%%%%%%%%%%%%% new turn %%%%%%%%%%%%%%%%");
  let conversation = messages;

  for (let roundTrip = 0; roundTrip < MAX_ROUND_TRIPS; roundTrip++) {
    console.error(`[agent] round trip ${roundTrip + 1}, ${conversation.length} messages`);
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages: conversation,
      },
      REQUEST_OPTIONS,
    );

    if (response.usage) {
      increment("llm_input_tokens_total", response.usage.input_tokens);
      increment("llm_output_tokens_total", response.usage.output_tokens);
    }

    const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((block) => block.type === "text");
      return textBlock?.text ?? "";
    }

    conversation = [
      ...conversation,
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: toolUseBlocks.map((block) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(runTool(block.name, block.input)),
        })),
      },
    ];
  }

  counters.roundTripLimitCrossed += 1;
  console.error(`[chat] the turn crossed ${MAX_ROUND_TRIPS} round trips`);
  return LIMIT_REPLY;
}
