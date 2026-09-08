import { useState, useEffect } from "react";

export default function Metrics({ refreshSignal }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/metrics");
      setMetrics(await res.json());
    })();
  }, [refreshSignal]);

  if (!metrics) return null;

  return (
    <div className="metrics" style={{ fontSize: "12px", padding: "8px", color: "#666" }}>
      People: {metrics.tree_people_total} | Parents: {metrics.tree_edges_parent_total} | Spouses: {metrics.tree_edges_spouse_total} | Tokens: {metrics.llm_input_tokens_total} in, {metrics.llm_output_tokens_total} out
    </div>
  );
}
