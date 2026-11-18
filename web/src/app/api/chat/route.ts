import { parseSse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTS = new Set(["counsel", "analyst", "reconciler"]);

type FinalPayload = {
  sessionId: string;
  text: string;
  citations: { ref?: string }[];
  abstained: boolean;
  agent: string | null;
  demo: boolean;
  kind: "final" | "clarify";
};

async function readTurn(response: Response, sessionId: string): Promise<FinalPayload> {
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Backline responded ${response.status}. ${detail.slice(0, 240)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let demo = false;
  while (true) {
    const { done, value } = await reader.read();
    rest += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseSse(rest);
    rest = parsed.rest;
    for (const event of parsed.events) {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      if (event.event === "routed" && data.demo === true) demo = true;
      if (event.event === "error") {
        throw new Error(typeof data.detail === "string" ? data.detail : "Backline returned an error.");
      }
      if (event.event === "clarify") {
        return {
          sessionId,
          text: typeof data.question === "string" ? data.question : "",
          citations: [],
          abstained: false,
          agent: null,
          demo,
          kind: "clarify",
        };
      }
      if (event.event === "final") {
        const citations = Array.isArray(data.citations) ? (data.citations as { ref?: string }[]) : [];
        return {
          sessionId,
          text: typeof data.text === "string" ? data.text : "",
          citations,
          abstained: data.abstained === true,
          agent: typeof data.agent === "string" ? data.agent : null,
          demo: data.demo === true || demo,
          kind: "final",
        };
      }
    }
    if (done) break;
  }
  throw new Error("Backline ended the stream without a final answer.");
}

export async function POST(request: Request): Promise<Response> {
  let body: { text?: unknown; sessionId?: unknown; agent?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; sessionId?: unknown; agent?: unknown };
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0 || text.length > 8000) {
    return Response.json({ error: "Message must be 1–8000 characters." }, { status: 400 });
  }
  const agent = typeof body.agent === "string" && AGENTS.has(body.agent) ? body.agent : null;
  const base = process.env.BACKLINE_API_URL ?? "http://localhost:8000";
  try {
    let sessionId = typeof body.sessionId === "string" && body.sessionId.length > 0 ? body.sessionId : null;
    if (!sessionId) {
      const created = await fetch(`${base}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 80) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!created.ok) {
        const detail = await created.text();
        throw new Error(`Could not open a Backline session (${created.status}). ${detail.slice(0, 200)}`);
      }
      const json = (await created.json()) as { id?: string };
      if (!json.id) throw new Error("Backline did not return a session id.");
      sessionId = json.id;
    }
    const stream = await fetch(`${base}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ text, agent }),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await readTurn(stream, sessionId);
    return Response.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Backline is not answering (${base}). ${message}` },
      { status: 502 },
    );
  }
}
