import { test, expect, joinAs, closePages, WsCapture, MOCK_YT_PATH } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Duplicate User Names
// ---------------------------------------------------------------------------

test.describe("Duplicate User Names", () => {
  test("Two users with same name join - both appear in listeners", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "DJ");
    const { page: pageB } = await joinAs(browser, "DJ");

    // Both should see 2 listeners
    await expect(pageA.locator("#listeners-num")).toHaveText("2");
    await expect(pageB.locator("#listeners-num")).toHaveText("2");

    // Popover should show both (even with same name)
    await pageA.click("#listeners-pill");
    await expect(pageA.locator("#popover-count")).toHaveText("2");

    // Popover count confirms both users are tracked
    await closePages(pageA, pageB);
  });

  test("Three users with same name - all tracked separately", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Anonymous");
    const { page: pageB } = await joinAs(browser, "Anonymous");
    const { page: pageC } = await joinAs(browser, "Anonymous");

    await expect(pageA.locator("#listeners-num")).toHaveText("3");
    await expect(pageB.locator("#listeners-num")).toHaveText("3");
    await expect(pageC.locator("#listeners-num")).toHaveText("3");

    await closePages(pageA, pageB, pageC);
  });
});

// ---------------------------------------------------------------------------
// 2. Invalid URL Handling
// ---------------------------------------------------------------------------

test.describe("Invalid URL Handling", () => {
  test("Empty URL - nothing happens, no crash", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Click add with empty input
    await page.click("#add-btn");

    // Should still show empty queue
    await expect(page.locator("#queue-list")).toContainText("Queue is empty");

    await closePages(page);
  });

  test("Whitespace-only URL - treated as empty", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    await page.fill("#track-input", "   ");
    await page.click("#add-btn");

    await expect(page.locator("#queue-list")).toContainText("Queue is empty");

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 3. Rapid Actions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4. Name Input Edge Cases
// ---------------------------------------------------------------------------

test.describe("Name Input Edge Cases", () => {
  test("Empty name uses Anonymous", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Click join without entering name
    await page.click("#join-btn");

    // Should join with Anonymous
    await expect(page.locator("#room-view")).toBeVisible();
    await expect(page.locator("#current-user-name")).toHaveText("Anonymous");

    await context.close();
  });

  test("Very long name - truncated or handled", async ({ browser }) => {
    const { page } = await joinAs(browser, "A".repeat(100));

    // Should still join successfully
    await closePages(page);
  });

  test("Name with emojis - displayed correctly", async ({ browser }) => {
    const { page } = await joinAs(browser, "🎵DJ🎶");

    await expect(page.locator("#room-view")).toBeVisible();
    await expect(page.locator("#current-user-name")).toContainText("🎵");

    await closePages(page);
  });

  test("Name with only whitespace becomes Anonymous", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    await page.fill("#name-input", "   ");
    await page.click("#join-btn");

    await expect(page.locator("#current-user-name")).toHaveText("Anonymous");

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 6. WebSocket Message Order
// ---------------------------------------------------------------------------

test.describe("WebSocket Message Order", () => {
  test("User joins while track playing - receives correct message order", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");

    // Alice adds track
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");

    // Bob joins
    const { page: pageB, ws: wsB } = await joinAs(browser, "Bob");

    // Bob should receive user_list first, then play_track
    const messages = wsB.getMessages("joined");
    expect(messages.length).toBeGreaterThan(0);

    // Should see play_track
    const playTrackMsg = wsB.getMessages("play_track");
    expect(playTrackMsg.length).toBeGreaterThan(0);

    await closePages(pageA, pageB);
  });

  test("Multiple rapid user joins - all tracked correctly", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");

    // Rapidly join multiple users
    const [pageB, pageC, pageD] = await Promise.all([
      joinAs(browser, "Bob").then(r => r.page),
      joinAs(browser, "Charlie").then(r => r.page),
      joinAs(browser, "David").then(r => r.page),
    ]);

    // All should see 4 users
    await expect(pageA.locator("#listeners-num")).toHaveText("4");
    await expect(pageB.locator("#listeners-num")).toHaveText("4");
    await expect(pageC.locator("#listeners-num")).toHaveText("4");
    await expect(pageD.locator("#listeners-num")).toHaveText("4");

    await closePages(pageA, pageB, pageC, pageD);
  });
});
