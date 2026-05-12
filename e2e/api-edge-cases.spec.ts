import { test, expect, joinAs, closePages, MOCK_YT_PATH } from "./helpers";

// ---------------------------------------------------------------------------
// 1. API Content-Type Handling
// ---------------------------------------------------------------------------

test.describe("API Content-Type Handling", () => {
  test("Request without JSON content-type handled gracefully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Send with text/plain
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      data: "url=https://youtube.com/watch?v=test",
      headers: { "Content-Type": "text/plain" }
    });

    // Should either work or return 400 gracefully
    expect([200, 400]).toContain(response.status());

    await context.close();
  });

  test("Request with form data returns appropriate error", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Create form data
    const formData = new FormData();
    formData.append("url", "https://youtube.com/watch?v=test");
    
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      multipart: { url: "https://youtube.com/watch?v=test" }
    });

    // Should handle gracefully
    expect([200, 400, 415]).toContain(response.status());

    await context.close();
  });

  test("Request with array instead of object handled gracefully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      data: ["https://youtube.com/watch?v=test"]
    });

    expect([200, 400]).toContain(response.status());

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 3. API Security & Edge Cases
// ---------------------------------------------------------------------------

test.describe("API Security & Edge Cases", () => {
  test("Very long URL handled gracefully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const longUrl = "https://www.youtube.com/watch?v=" + "a".repeat(1000);
    
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      data: { url: longUrl }
    });

    // Should not crash (500)
    expect(response.status()).not.toBe(500);

    await context.close();
  });

  test("URL with null bytes handled gracefully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      data: { url: "https://youtube.com/watch?v=test\x00injected" }
    });

    // Should not crash
    expect(response.status()).not.toBe(500);

    await context.close();
  });

  test("URL with Unicode characters handled", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.post("http://localhost:3000/api/resolve", {
      data: { url: "https://youtube.com/watch?v=🎵🎶" }
    });

    // Should handle gracefully (likely 400 for invalid video ID)
    expect([200, 400]).toContain(response.status());

    await context.close();
  });

  test("GET request to /api/resolve returns method not allowed or 404", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/api/resolve");

    // Should be 404 (not found) or 405 (method not allowed)
    expect([404, 405]).toContain(response.status());

    await context.close();
  });

  test("OPTIONS request handled", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.fetch("http://localhost:3000/api/resolve", {
      method: "OPTIONS"
    });

    // Should be 404 or handled gracefully
    expect([404, 200, 204]).toContain(response.status());

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 4. WebSocket API Tests
// ---------------------------------------------------------------------------

test.describe("WebSocket Message Validation", () => {
  test("Invalid WebSocket message handled gracefully", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Send invalid JSON via page console
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws?: WebSocket }).__ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("not valid json");
      }
    });

    // App should not crash, still functional
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");

    // Should work normally
    await expect(page.locator("#now-playing")).toBeVisible();

    await closePages(page);
  });

  test("WebSocket message with missing type handled gracefully", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Send message without type
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws?: WebSocket }).__ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ data: "test" }));
      }
    });

    // App should still work
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");

    await expect(page.locator("#now-playing")).toBeVisible();

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 5. Static File Serving
// ---------------------------------------------------------------------------

test.describe("Static File Serving", () => {
  test("Index.html served at root", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/");
    
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/html");

    await context.close();
  });

  test("SVG files served correctly", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/radio-room-logo-mark.svg");
    
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");

    await context.close();
  });

  test("CSS files served correctly", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/style.css");
    
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/css");

    await context.close();
  });

  test("Non-existent file returns 404", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/nonexistent-file.txt");
    
    expect(response.status()).toBe(404);

    await context.close();
  });

  test("Directory traversal blocked", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const response = await page.request.get("http://localhost:3000/../package.json");
    
    // Should be 404 (file not found) or handled gracefully
    expect([404, 400]).toContain(response.status());

    await context.close();
  });
});
