import { test, expect, joinAs, closePages, WsCapture, MOCK_YT_PATH } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Join & Connection
// ---------------------------------------------------------------------------

test.describe("Join & Connection", () => {
  test("User A joins → sees room view with 1 online and their name in listeners", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    await expect(page.locator("#listeners-num")).toHaveText("1");
    await page.click("#listeners-pill");
    await expect(page.locator("#popover-list")).toContainText("Alice");

    // Player is ready (mock fires onReady which hides placeholder)
    // No track playing yet — mock iframe has no videoId
    await expect(page.locator("#mock-yt-player")).toHaveAttribute("data-video-id", "");

    await closePages(page);
  });

  test("User B joins → both see 2 online and both names", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    await expect(pageA.locator("#listeners-num")).toHaveText("2");
    await expect(pageB.locator("#listeners-num")).toHaveText("2");
    await pageA.click("#listeners-pill");
    await expect(pageA.locator("#popover-list")).toContainText("Bob");

    await closePages(pageA, pageB);
  });

  test("User A disconnects → User B sees 1 online and Alice removed", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    await closePages(pageA);

    await expect(pageB.locator("#listeners-num")).toHaveText("1");
    await pageB.click("#listeners-pill");
    await expect(pageB.locator("#popover-list")).not.toContainText("Alice");

    await closePages(pageB);
  });
});

// ---------------------------------------------------------------------------
// 2. Add Track & Playback Sync (the multi-user bug)
// ---------------------------------------------------------------------------

test.describe("Add Track & Playback Sync", () => {
  test("User A adds a track → now-playing shows title, artist, and added-by", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    await expect(page.locator("#now-playing")).toBeVisible();
    await expect(page.locator("#np-title")).not.toBeEmpty();
    await expect(page.locator("#np-meta")).toContainText("Added by Alice");
    await expect(page.locator("#np-meta")).toContainText("youtube");
    await expect(page.locator("#player-placeholder")).toBeHidden();

    await closePages(page);
  });

  test("User B joins AFTER track started → receives play_track and sees the same song", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");

    // Alice starts playing
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");

    // Bob joins after the track is already playing
    const { page: pageB, ws: wsB } = await joinAs(browser, "Bob");

    // Bob should receive play_track from the server on join
    await wsB.waitForMessage("play_track");

    // Bob should see the now-playing info
    await expect(pageB.locator("#now-playing")).toBeVisible();
    await expect(pageB.locator("#np-meta")).toContainText("Added by Alice");

    // Both see the same track title
    const titleA = await pageA.locator("#np-title").textContent();
    const titleB = await pageB.locator("#np-title").textContent();
    expect(titleA).toBe(titleB);

    await closePages(pageA, pageB);
  });

  test("User B adds a track while A's track plays → goes to queue, both see update", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");
    const { page: pageB, ws: wsB } = await joinAs(browser, "Bob");

    // Alice adds track 1
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");

    wsA.clear();
    wsB.clear();

    // Bob adds track 2
    await pageB.fill("#track-input", "https://www.youtube.com/watch?v=9bZkp7q19f0");
    await pageB.click("#add-btn");
    await wsA.waitForMessage("queue_update");

    // Queue has 1 item on both pages
    await expect(pageA.locator("#queue-count")).toHaveText("(1)");
    await expect(pageB.locator("#queue-count")).toHaveText("(1)");

    // Current track still Alice's
    await expect(pageA.locator("#np-meta")).toContainText("Added by Alice");

    await closePages(pageA, pageB);
  });

  test("Track ends → next track auto-plays for both users", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Alice adds track 1
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");

    // Bob adds track 2
    wsA.clear();
    await pageB.fill("#track-input", "https://www.youtube.com/watch?v=9bZkp7q19f0");
    await pageB.click("#add-btn");
    await wsA.waitForMessage("queue_update");

    // Track ends — use mock player's simulateEnd to trigger ENDED state
    wsA.clear();
    await pageA.evaluate(() => {
      window.__mockYtPlayer.simulateEnd();
    });
    await wsA.waitForMessage("play_track");

    // Both show Bob's track now
    await expect(pageA.locator("#np-meta")).toContainText("Added by Bob");
    await expect(pageB.locator("#np-meta")).toContainText("Added by Bob");
    await expect(pageA.locator("#queue-count")).toHaveText("");

    await closePages(pageA, pageB);
  });
});

// ---------------------------------------------------------------------------
// 3. Queue Management
// ---------------------------------------------------------------------------

test.describe("Queue Management", () => {
  test("Empty queue shows placeholder message", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    await expect(page.locator("#queue-list")).toContainText("Queue is empty");

    await closePages(page);
  });

  test("Add 3 tracks → 1st plays, queue shows 2 in order", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=9bZkp7q19f0",
      "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
    ];

    for (const url of urls) {
      await page.fill("#track-input", url);
      await page.click("#add-btn");
      await page.waitForTimeout(800);
    }

    // Wait for final state to settle
    await ws.waitForMessage("queue_update");

    await expect(page.locator("#queue-count")).toHaveText("(2)");
    await expect(page.locator(".queue-item")).toHaveCount(2);
    await expect(page.locator("#now-playing")).toBeVisible();

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 4. Vote to Skip
// ---------------------------------------------------------------------------

test.describe("Vote to Skip", () => {
  test("Single user skips → skip triggers immediately", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    // Add 2 tracks
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    ws.clear();
    await page.fill("#track-input", "https://www.youtube.com/watch?v=9bZkp7q19f0");
    await page.click("#add-btn");
    await ws.waitForMessage("queue_update");

    // Skip
    ws.clear();
    await page.click("#skip-btn");
    await ws.waitForMessage("track_skipped");

    await expect(page.locator("#queue-count")).toHaveText("");

    await closePages(page);
  });

  test("Two users: 1 vote doesn't skip, 2 votes do", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Alice adds track 1
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");

    // Bob adds track 2
    wsA.clear();
    await pageB.fill("#track-input", "https://www.youtube.com/watch?v=9bZkp7q19f0");
    await pageB.click("#add-btn");
    await wsA.waitForMessage("queue_update");

    // Alice votes — 1/2, not enough
    wsA.clear();
    await pageA.click("#skip-btn");
    await wsA.waitForMessage("skip_update");

    await expect(pageA.locator("#skip-count")).toHaveText("1/2");
    await expect(pageA.locator("#np-meta")).toContainText("Added by Alice");

    // Bob votes — 2/2, triggers skip
    wsA.clear();
    await pageB.click("#skip-btn");
    await wsA.waitForMessage("track_skipped");

    await expect(pageA.locator("#np-meta")).toContainText("Added by Bob");
    await expect(pageB.locator("#np-meta")).toContainText("Added by Bob");

    await closePages(pageA, pageB);
  });

  test("Skip button has cooldown (disabled after click)", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    await page.click("#skip-btn");
    await expect(page.locator("#skip-btn")).toBeDisabled();

    await page.waitForTimeout(3500);
    await expect(page.locator("#skip-btn")).toBeEnabled();

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 5. Multi-User Join Sync
// ---------------------------------------------------------------------------

test.describe("Multi-User Join Sync", () => {
  test("User A playing a track → User B joins → B immediately sees the playing track", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");

    // Alice starts playing
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");
    await expect(pageA.locator("#now-playing")).toBeVisible();

    // Bob opens page manually (to test join screen → room sync)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const wsB = new WsCapture();
    wsB.attach(pageB);
    await pageB.addInitScript({ path: MOCK_YT_PATH });
    await pageB.goto("http://localhost:3000");

    // Sees join screen first
    await expect(pageB.locator("#join-screen")).toBeVisible();

    // Bob joins
    await pageB.fill("#name-input", "Bob");
    await pageB.click("#join-btn");

    // Bob should see room view + playing track
    await expect(pageB.locator("#room-view")).toBeVisible();
    await wsB.waitForMessage("play_track");
    await expect(pageB.locator("#now-playing")).toBeVisible();

    // Same track title
    const titleA = await pageA.locator("#np-title").textContent();
    const titleB = await pageB.locator("#np-title").textContent();
    expect(titleA).toBe(titleB);

    // Both see 2 users
    await expect(pageA.locator("#user-count")).toHaveText("2 online");
    await expect(pageB.locator("#user-count")).toHaveText("2 online");

    await closePages(pageA);
    await contextB.close();
  });
});

// ---------------------------------------------------------------------------
// 6. Auto-Cleanup on Empty Room
// ---------------------------------------------------------------------------

test.describe("Auto-Cleanup on Empty Room", () => {
  test("Last user leaves → room clears → next user gets empty room", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");

    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await wsA.waitForMessage("play_track");
    await expect(pageA.locator("#now-playing")).toBeVisible();

    // Alice leaves (last user)
    await closePages(pageA);

    // New user joins — should see empty room
    const { page: pageB } = await joinAs(browser, "Bob");

    await expect(pageB.locator("#now-playing")).toBeHidden();
    // Mock player is ready but has no video loaded
    await expect(pageB.locator("#mock-yt-player")).toHaveAttribute("data-video-id", "");
    await expect(pageB.locator("#queue-list")).toContainText("Queue is empty");
    await expect(pageB.locator("#user-count")).toHaveText("1 online");

    await closePages(pageB);
  });
});

// ---------------------------------------------------------------------------
// 7. Error Handling
// ---------------------------------------------------------------------------

test.describe("Error Handling", () => {
  test("Invalid URL → shows error toast", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    await page.fill("#track-input", "https://example.com/not-a-song");
    await page.click("#add-btn");

    await expect(page.locator("#rr-toast")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#rr-toast")).toContainText("Unrecognized URL");

    await closePages(page);
  });

  test("Empty add → nothing happens (no error, no crash)", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    await page.click("#add-btn");

    await expect(page.locator("#queue-list")).toContainText("Queue is empty");
    await expect(page.locator("#rr-toast")).not.toBeVisible();

    await closePages(page);
  });
});
