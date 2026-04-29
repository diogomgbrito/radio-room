import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage } from "./types";
import { resolveUrl } from "./services/link-resolver";
import { initDb } from "./services/db";

// Initialize database
initDb();

const connectedClients = new Set<ServerWebSocket>();

const server = Bun.serve({
  port: 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const success = server.upgrade(req);
      if (!success) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return; // upgrade handles the response
    }

    // POST /api/resolve
    if (url.pathname === "/api/resolve" && req.method === "POST") {
      try {
        const body = (await req.json()) as { url?: string };
        if (!body.url || typeof body.url !== "string") {
          return Response.json(
            { error: "Missing or invalid 'url' field." },
            { status: 400 },
          );
        }

        const resolved = await resolveUrl(body.url);
        return Response.json(resolved);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to resolve URL.";
        return Response.json({ error: message }, { status: 400 });
      }
    }

    // Static file serving from public/
    let filePath = url.pathname;
    if (filePath === "/") {
      filePath = "/index.html";
    }

    const absolutePath = `${import.meta.dir}/../public${filePath}`;
    const file = Bun.file(absolutePath);

    // If file doesn't exist, return 404
    if (!(file.size > 0)) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file);
  },
  websocket: {
    open(ws: ServerWebSocket) {
      connectedClients.add(ws);
      console.log(`[ws] client connected (${connectedClients.size} total)`);
    },
    message(ws: ServerWebSocket, message: string | Buffer) {
      try {
        const parsed: ClientMessage = JSON.parse(
          typeof message === "string" ? message : message.toString()
        );
        console.log("[ws] received:", parsed.type);
        // TODO: handle messages in tasks 4 & 5
      } catch {
        console.warn("[ws] invalid message received");
      }
    },
    close(ws: ServerWebSocket) {
      connectedClients.delete(ws);
      console.log(`[ws] client disconnected (${connectedClients.size} total)`);
    },
  },
});

console.log(`🎵 Radio Room running on http://localhost:${server.port}`);
