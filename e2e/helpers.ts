import { test as base, expect, type Page, type Browser } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join as pjoin } from "node:path";

const __dirname = pjoin(fileURLToPath(import.meta.url), "..");
export const MOCK_YT_PATH = pjoin(__dirname, "mock-youtube-api.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<{ browser: Browser }>({});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_URL = "http://localhost:3000";

/**
 * Captures all WebSocket messages received by a page.
 * Must be attached BEFORE navigation.
 */
export class WsCapture {
  private messages: Array<Record<string, unknown>> = [];
  private waiters: Array<{
    type: string;
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  attach(page: Page) {
    page.on("websocket", (ws) => {
      ws.on("framereceived", (event) => {
        try {
          const msg = JSON.parse(event.payload as string);
          this.messages.push(msg as Record<string, unknown>);
          // Resolve any waiting promises
          this.waiters = this.waiters.filter((w) => {
            if (msg.type === w.type) {
              clearTimeout(w.timer);
              w.resolve(msg as Record<string, unknown>);
              return false;
            }
            return true;
          });
        } catch {
          // ignore non-JSON
        }
      });
    });
  }

  /** Wait for a specific message type (checks backlog + live) */
  waitForMessage(type: string, timeout = 10_000): Promise<Record<string, unknown>> {
    // Check backlog first
    const found = this.messages.find((m) => m.type === type);
    if (found) return Promise.resolve(found);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(
          new Error(
            `Timed out waiting for WS message: ${type}\n` +
              `  Messages received: [${this.messages.map((m) => m.type).join(", ")}]`,
          ),
        );
      }, timeout);

      const waiter = { type, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  /** Get all messages of a given type */
  getMessages(type: string): Array<Record<string, unknown>> {
    return this.messages.filter((m) => m.type === type);
  }

  /** Clear captured messages (useful between test steps) */
  clear() {
    this.messages = [];
  }
}

/**
 * Create a new browser context + page, set up WS capture,
 * navigate to the app, and join the room with the given name.
 */
export async function joinAs(
  browser: Browser,
  name: string,
): Promise<{ page: Page; ws: WsCapture }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const ws = new WsCapture();

  // Inject YouTube mock before any scripts run
  await page.addInitScript({ path: MOCK_YT_PATH });

  // Capture WS messages from the start
  ws.attach(page);

  await page.goto(APP_URL);

  // Fill name and click Join
  await page.fill("#name-input", name);
  await page.click("#join-btn");

  // Wait for room view to appear
  await expect(page.locator("#room-view")).toBeVisible();

  return { page, ws };
}

/** Close all pages (closes their contexts) */
export async function closePages(...pages: Page[]) {
  for (const p of pages) {
    await p.context().close().catch(() => {});
  }
}

export { expect };
