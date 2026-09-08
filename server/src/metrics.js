const metrics = {
  chat_messages_total: 0,
  chat_errors_total: 0,
  llm_input_tokens_total: 0,
  llm_output_tokens_total: 0,
  tree_people_total: 0,
  tree_edges_parent_total: 0,
  tree_edges_spouse_total: 0,
  tree_cycles_rejected_total: 0,
};

const MAX_ROUND_TRIPS = 10;

function increment(key, value = 1) {
  if (!(key in metrics)) throw new Error(`Unknown metric: ${key}`);
  metrics[key] += value;
  if (key === "chat_errors_total" && metrics.chat_errors_total > MAX_ROUND_TRIPS) {
    console.error(`[metrics] ALERT: chat_errors_total exceeds ${MAX_ROUND_TRIPS} (now ${metrics.chat_errors_total})`);
  }
}

function get() {
  return { ...metrics };
}

export { increment, get };
