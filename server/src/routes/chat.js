import { Router } from "express";
import { getChatReply } from "../llm/client.js";
import { increment } from "../metrics.js";

export const chatRouter = Router();

// POST /api/chat
// Body: { messages: [{ role: "user" | "assistant", content: string }, ...] }
//
// The client holds the conversation and sends all of it every turn, so this
// route keeps no state. The agent loop behind it runs the tools and answers
// with plain text.
chatRouter.post("/", async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages must be an array" });
  }

  try {
    const reply = await getChatReply(messages);
    increment("chat_messages_total");
    res.json({ reply });
  } catch (err) {
    console.error("[chat] LLM request failed:", err);
    increment("chat_errors_total");
    res.status(502).json({ error: "LLM request failed" });
  }
});
