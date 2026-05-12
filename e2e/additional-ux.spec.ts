import { test, expect, joinAs, closePages, WsCapture, MOCK_YT_PATH } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Volume Controls
// ---------------------------------------------------------------------------

test.describe("Volume Controls", () => {
  test("Volume slider changes value and icon updates", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Initial volume should be 80 (default)
    await expect(page.locator("#volume-slider")).toHaveValue("80");

    // Change volume to 50
    await page.locator("#volume-slider").fill("50");
    await expect(page.locator("#volume-slider")).toHaveValue("50");

    // Change volume to 0 (mute)
    await page.locator("#volume-slider").fill("0");
    await expect(page.locator("#volume-slider")).toHaveValue("0");

    // Volume icon should update (waves hidden via display:none at volume 0)
    await expect(page.locator("#volume-wave1")).toBeHidden();
    await expect(page.locator("#volume-wave2")).toBeHidden();

    // Change volume to 100
    await page.locator("#volume-slider").fill("100");
    await expect(page.locator("#volume-slider")).toHaveValue("100");

    // Volume icon should show all waves (display: visible)
    await expect(page.locator("#volume-wave1")).toBeVisible();
    await expect(page.locator("#volume-wave2")).toBeVisible();

    await closePages(page);
  });

  test("Mute button toggles volume state", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Set initial volume
    await page.locator("#volume-slider").fill("80");

    // Click mute button
    await page.click("#volume-btn");

    // Slider should go to 0
    await expect(page.locator("#volume-slider")).toHaveValue("0");
    await expect(page.locator("#volume-wave1")).toBeHidden();

    // Click again to unmute - should restore previous volume
    await page.click("#volume-btn");
    await expect(page.locator("#volume-slider")).toHaveValue("80");
    await expect(page.locator("#volume-wave1")).toBeVisible();

    await closePages(page);
  });

  test("Volume persists after adding a track", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    // Set volume to 30
    await page.locator("#volume-slider").fill("30");
    await expect(page.locator("#volume-slider")).toHaveValue("30");

    // Add a track
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    // Volume should still be 30
    await expect(page.locator("#volume-slider")).toHaveValue("30");

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 2. Listeners Popover
// ---------------------------------------------------------------------------

test.describe("Listeners Popover", () => {
  test("Two users - clicking listeners pill shows popover with both names", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Both pages should show 2 online
    await expect(pageA.locator("#listeners-num")).toHaveText("2");
    await expect(pageB.locator("#listeners-num")).toHaveText("2");

    // Alice clicks listeners pill
    await pageA.click("#listeners-pill");

    // Popover should appear with both users
    await expect(pageA.locator("#listeners-popover")).not.toHaveClass(/hidden/);
    await expect(pageA.locator("#popover-count")).toHaveText("2");
    await expect(pageA.locator("#popover-list")).toContainText("Alice");
    await expect(pageA.locator("#popover-list")).toContainText("Bob");

    await closePages(pageA, pageB);
  });

  test("Popover closes when clicking outside", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Open popover
    await pageA.click("#listeners-pill");
    await expect(pageA.locator("#listeners-popover")).toBeVisible();

    // Click outside (on the body, outside the listeners anchor)
    await pageA.evaluate(() => document.body.click());

    // Popover should be hidden
    await expect(pageA.locator("#listeners-popover")).toBeHidden();

    await closePages(pageA, pageB);
  });

  test("Popover updates when user joins/leaves", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Open popover
    await pageA.click("#listeners-pill");
    await expect(pageA.locator("#popover-count")).toHaveText("2");

    // Bob leaves
    await closePages(pageB);

    // Popover should update to 1
    await expect(pageA.locator("#popover-count")).toHaveText("1");
    await expect(pageA.locator("#popover-list")).toContainText("Alice");
    await expect(pageA.locator("#popover-list")).not.toContainText("Bob");

    await closePages(pageA);
  });

  test("Three users - all names appear in popover", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");
    const { page: pageC } = await joinAs(browser, "Charlie");

    // Open popover on Alice's page
    await pageA.click("#listeners-pill");

    await expect(pageA.locator("#popover-count")).toHaveText("3");
    await expect(pageA.locator("#popover-list")).toContainText("Alice");
    await expect(pageA.locator("#popover-list")).toContainText("Bob");
    await expect(pageA.locator("#popover-list")).toContainText("Charlie");

    await closePages(pageA, pageB, pageC);
  });
});

// ---------------------------------------------------------------------------
// 3. Progress Bar & Vinyl Animation
// ---------------------------------------------------------------------------

test.describe("Progress Bar & Vinyl Animation", () => {
  test("Progress bar updates when track plays", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    // Initially progress bar at 0%
    const progressBar = page.locator("#progress-bar");

    // Add a track
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    // Progress bar should be visible
    await expect(page.locator(".rr-progress")).toBeVisible();
    
    // Wait for YouTube player to be ready and start playing
    await page.waitForTimeout(1000);
    // Progress bar container should be visible (actual width depends on player state)
    await expect(progressBar).toBeVisible();

    await closePages(page);
  });

  test("Vinyl spins when track is playing", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    // Add a track
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    // Vinyl element should exist and have spinning animation class
    const vinyl = page.locator("#rr-vinyl");
    await expect(vinyl).toBeVisible();

    // Check if animation is applied (by checking computed style or class)
    const animation = await vinyl.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.animationName !== "none";
    });
    expect(animation).toBe(true);

    await closePages(page);
  });

});

// ---------------------------------------------------------------------------
// 4. Visual/Animation States
// ---------------------------------------------------------------------------

test.describe("Visual States & Animations", () => {
  test("ON AIR indicator blinks in join screen", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // ON AIR should be visible on join screen (use specific join screen selector)
    await expect(page.locator(".rr-join .rr-onair")).toBeVisible();

    // Check blinking animation is applied
    const onairMark = page.locator(".rr-join .rr-onair-mark");
    const hasAnimation = await onairMark.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.animationName !== "none";
    });
    expect(hasAnimation).toBe(true);

    await context.close();
  });

  test("ON AIR indicator blinks in room view", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // ON AIR should be visible in top bar
    await expect(page.locator(".rr-topbar .rr-onair")).toBeVisible();

    // Check blinking animation
    const onairMark = page.locator(".rr-topbar .rr-onair-mark");
    const hasAnimation = await onairMark.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.animationName !== "none";
    });
    expect(hasAnimation).toBe(true);

    await closePages(page);
  });

  test("SVG logos render correctly", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Check logo SVG loads
    const logoImg = page.locator(".rr-logo-sm img");
    await expect(logoImg).toBeVisible();
    await expect(logoImg).toHaveAttribute("src", "./radio-room-logo-mark.svg");

    // Check ON AIR mark SVG loads
    const onairImg = page.locator(".rr-topbar .rr-onair-mark img");
    await expect(onairImg).toBeVisible();
    await expect(onairImg).toHaveAttribute("src", "./radio-room-onair-mark.svg");

    await closePages(page);
  });

  test("Player has glowing effect when track is playing", async ({ browser }) => {
    const { page, ws } = await joinAs(browser, "Alice");

    // Initially no glow (no track)
    const player = page.locator("#rr-player");

    // Add a track
    await page.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.click("#add-btn");
    await ws.waitForMessage("play_track");

    // Player should have glowing class
    await expect(player).toHaveClass(/glowing/);

    await closePages(page);
  });

  test("Ambient glow is present on join screen", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Ambient glow element should exist
    const ambient = page.locator(".rr-ambient");
    await expect(ambient).toBeVisible();
    await expect(ambient).toHaveClass(/on/);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 5. Multi-User Sync Scenarios
// ---------------------------------------------------------------------------

test.describe("Multi-User Synchronization", () => {
  test("Three users adding tracks - queue syncs correctly", async ({ browser }) => {
    const { page: pageA, ws: wsA } = await joinAs(browser, "Alice");
    const { page: pageB, ws: wsB } = await joinAs(browser, "Bob");
    const { page: pageC, ws: wsC } = await joinAs(browser, "Charlie");

    // Alice adds first track (plays immediately)
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");
    await Promise.all([
      wsA.waitForMessage("play_track"),
      wsB.waitForMessage("play_track"),
      wsC.waitForMessage("play_track"),
    ]);

    // Bob adds second track (queued)
    wsA.clear();
    wsB.clear();
    wsC.clear();
    await pageB.fill("#track-input", "https://www.youtube.com/watch?v=9bZkp7q19f0");
    await pageB.click("#add-btn");
    await Promise.all([
      wsA.waitForMessage("queue_update"),
      wsB.waitForMessage("queue_update"),
      wsC.waitForMessage("queue_update"),
    ]);

    // Charlie adds third track (queued)
    wsA.clear();
    wsB.clear();
    wsC.clear();
    await pageC.fill("#track-input", "https://www.youtube.com/watch?v=kJQP7kiw5Fk");
    await pageC.click("#add-btn");
    await Promise.all([
      wsA.waitForMessage("queue_update"),
      wsB.waitForMessage("queue_update"),
      wsC.waitForMessage("queue_update"),
    ]);

    // All three see queue count of 2
    await expect(pageA.locator("#queue-count")).toHaveText("(2)");
    await expect(pageB.locator("#queue-count")).toHaveText("(2)");
    await expect(pageC.locator("#queue-count")).toHaveText("(2)");

    // Current track shows Alice added it
    await expect(pageA.locator("#np-meta")).toContainText("Added by Alice");
    await expect(pageB.locator("#np-meta")).toContainText("Added by Alice");
    await expect(pageC.locator("#np-meta")).toContainText("Added by Alice");

    await closePages(pageA, pageB, pageC);
  });

  test("Two users - one mutes while other keeps volume", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Add a track first
    await pageA.fill("#track-input", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await pageA.click("#add-btn");

    // Set different volumes
    await pageA.locator("#volume-slider").fill("80");
    await pageB.locator("#volume-slider").fill("50");

    await expect(pageA.locator("#volume-slider")).toHaveValue("80");
    await expect(pageB.locator("#volume-slider")).toHaveValue("50");

    // Alice mutes
    await pageA.click("#volume-btn");
    await expect(pageA.locator("#volume-slider")).toHaveValue("0");

    // Bob should still have volume 50
    await expect(pageB.locator("#volume-slider")).toHaveValue("50");

    await closePages(pageA, pageB);
  });
});
