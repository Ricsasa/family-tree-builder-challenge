import { getChatReply } from "../llm/client.js";

export async function sendMessage(messages, content) {
  const updated = [...messages, { role: "user", content }];
  const reply = await getChatReply(updated);
  return { messages: [...updated, { role: "assistant", content: reply }], reply };
}
