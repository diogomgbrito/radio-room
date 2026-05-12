import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage } from "./types";
import { resolveUrl } from "./services/link-resolver";
import { initDb } from "./services/db";
import { routeMessage, handleDisconnect, type WSData } from "./ws/handlers";

// Initialize database (optional — disabled by default)
initDb();

const connectedClients = new Set<ServerWebSocket<WSData>>();
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || "*";

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function broadcast(message: ServerMessage, excludeWs?: ServerWebSocket<WSData>) {
  const text = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(text);
    }
  }
}

const server = Bun.serve<WSData>({
  port: Number(process.env.PORT) || 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const success = server.upgrade(req, {
        data: { userId: "" } as WSData,
      });
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
            { status: 400, headers: corsHeaders() },
          );
        }

        const resolved = await resolveUrl(body.url);
        return Response.json(resolved, { headers: corsHeaders() });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to resolve URL.";
        return Response.json({ error: message }, { status: 400, headers: corsHeaders() });
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
    open(ws: ServerWebSocket<WSData>) {
      connectedClients.add(ws);
      console.log(`[ws] client connected (${connectedClients.size} total)`);
    },
    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      try {
        const parsed: ClientMessage = JSON.parse(
          typeof message === "string" ? message : message.toString(),
        );
        console.log("[ws] received:", parsed.type);
        routeMessage(ws, parsed, broadcast);
      } catch {
        console.warn("[ws] invalid message received");
      }
    },
    close(ws: ServerWebSocket<WSData>) {
      handleDisconnect(ws, broadcast);
      connectedClients.delete(ws);
      console.log(`[ws] client disconnected (${connectedClients.size} total)`);
    },
  },
});

console.log(`🎵 Radio Room running on http://localhost:${server.port}`);
