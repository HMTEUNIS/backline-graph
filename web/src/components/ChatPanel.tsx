"use client";

import { useState } from "react";

import type { ArtistField, Citation, Metric } from "@/lib/types";
import { contractLabel } from "@/lib/types";
import { citeAgentText, tryGraphAnswer } from "@/lib/ground";

type AgentName = "counsel" | "analyst" | "reconciler";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  badge: string | null;
  unverified: boolean;
};

type Props = {
  field: ArtistField[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  onCitations: (ids: number[]) => void;
  onFocus: (contractId: number) => void;
};

async function askBackline(text: string, sessionId: string | null, agent: AgentName | null) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, sessionId, agent }),
  });
  const body = (await response.json()) as {
    error?: string;
    sessionId?: string;
    text?: string;
    citations?: { ref?: string }[];
    abstained?: boolean;
    agent?: string | null;
    demo?: boolean;
    kind?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Backline request failed.");
  return body;
}

export default function ChatPanel({ field, metric, onMetric, onCitations, onFocus }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("Which artists had their rate cut?");
  const [pending, setPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentName | "">("");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    const user: ChatMessage = { id: Date.now(), role: "user", text, citations: [], badge: null, unverified: false };
    setMessages((current) => [...current, user]);
    setDraft("");
    setError(null);
    const graph = tryGraphAnswer(text, field, metric);
    if (graph) {
      if (graph.metric) onMetric(graph.metric);
      const ids = [...new Set(graph.citations.map((citation) => citation.contractId))];
      onCitations(ids);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: graph.text,
          citations: graph.citations,
          badge: "From the graph. No model was called.",
          unverified: false,
        },
      ]);
      return;
    }
    setPending(true);
    try {
      const reply = await askBackline(text, sessionId, agent === "" ? null : agent);
      if (reply.sessionId) setSessionId(reply.sessionId);
      const refs = (reply.citations ?? []).flatMap((citation) => (citation.ref ? [citation.ref] : []));
      const citations = citeAgentText(reply.text ?? "", refs, field);
      const abstained = Boolean(reply.abstained) || reply.kind === "clarify";
      const unverified = !abstained && citations.length === 0;
      onCitations(citations.map((citation) => citation.contractId));
      const who = reply.agent ? `Backline ${reply.agent}` : "Backline";
      const mode = reply.demo ? " · demo mode" : "";
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: reply.text ?? "",
          citations,
          badge: unverified ? null : `${who}${mode}`,
          unverified,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="chat">
      <header className="chat-head">
        <h2>Ask about this data.</h2>
        <label>
          Agent
          <select value={agent} onChange={(event) => setAgent(event.target.value as AgentName | "")}>
            <option value="">Auto</option>
            <option value="analyst">Analyst</option>
            <option value="counsel">Counsel</option>
            <option value="reconciler">Reconciler</option>
          </select>
        </label>
      </header>
      <div className="thread">
        {messages.length === 0 ? (
          <p className="empty">
            Rate changes are answered from the field. Anything else goes to Backline on port 8000, and a reply is
            marked unverified unless it names a contract in this graph.
          </p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className={message.role === "user" ? "bubble user" : "bubble"}>
            <p>{message.text}</p>
            {message.badge ? <p className="badge">{message.badge}</p> : null}
            {message.unverified ? <p className="unverified">Unverified — not grounded in graph data.</p> : null}
            {message.citations.length > 0 ? (
              <div className="chips">
                {[...new Set(message.citations.map((citation) => citation.contractId))].map((contractId) => {
                  const node = field.flatMap((artist) => artist.nodes).find((item) => item.contractId === contractId);
                  return (
                    <button key={contractId} type="button" className="chip" onClick={() => onFocus(contractId)}>
                      {node ? contractLabel(node) : contractId}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
        {pending ? (
          <p className="live">
            <span className="lamp" /> Asking Backline…
          </p>
        ) : null}
        {error ? <p className="unverified">{error}</p> : null}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          rows={3}
          maxLength={8000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={pending || draft.trim().length === 0}>
          Send
        </button>
      </form>
      <p className="footer-note">Responses are generated by an LLM and may be wrong. Click any node to verify.</p>
    </section>
  );
}
