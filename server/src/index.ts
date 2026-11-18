import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createYoga } from "graphql-yoga";

import { closePool } from "./db.js";
import { loadWorld } from "./load.js";
import { schema } from "./schema.js";

const port = Number(process.env.PORT ?? 4000);

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  context: async () => ({ world: await loadWorld() }),
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type"],
  },
});

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const path = req.url?.split("?")[0];
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "backline-graph" }));
    return;
  }
  yoga(req, res);
});

server.listen(port, () => {
  console.log(`backline-graph graphql on http://localhost:${port}/graphql`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
