import type { ServerWebSocket } from "bun";

const server = Bun.serve({
  fetch(req, server) {
    return new Response("Radio Room running");
  },
  websocket: {
    message(ws: ServerWebSocket, message: string | Buffer) {},
    open(ws: ServerWebSocket) {},
    close(ws: ServerWebSocket) {},
  },
});

console.log(`🎵 Radio Room running on http://localhost:${server.port}`);
