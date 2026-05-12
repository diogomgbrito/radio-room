import { test, expect, joinAs, closePages, MOCK_YT_PATH } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Join Screen Keyboard Navigation
// ---------------------------------------------------------------------------

test.describe("Join Screen Keyboard Navigation", () => {
  test("Tab navigates through join screen elements in order", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Start at name input
    await page.locator("#name-input").focus();
    await expect(page.locator("#name-input")).toBeFocused();

    // Tab to join button
    await page.keyboard.press("Tab");
    await expect(page.locator("#join-btn")).toBeFocused();

    await context.close();
  });

  test("Enter key submits join form", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Enter name
    await page.fill("#name-input", "Alice");
    
    // Press Enter
    await page.keyboard.press("Enter");

    // Should join room
    await expect(page.locator("#room-view")).toBeVisible();

    await context.close();
  });

  test("Space key in name input does not submit", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Focus name input
    await page.locator("#name-input").focus();
    
    // Type space character
    await page.keyboard.press("Space");

    // Should still be on join screen
    await expect(page.locator("#join-screen")).toBeVisible();

    // Name should contain space
    await expect(page.locator("#name-input")).toHaveValue(" ");

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// 2. Room View Keyboard Navigation
// ---------------------------------------------------------------------------

// 3. Form Input Accessibility
// ---------------------------------------------------------------------------

test.describe("Form Input Accessibility", () => {
  test("Track input has correct label association", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    const input = page.locator("#track-input");
    
    // Should have placeholder for context
    await expect(input).toHaveAttribute("placeholder", "Paste YouTube or Spotify link...");

    await closePages(page);
  });

  test("Name input has correct label", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript({ path: MOCK_YT_PATH });
    await page.goto("http://localhost:3000");

    // Check label exists and is associated
    const label = page.locator("label[for='name-input']");
    await expect(label).toBeVisible();
    await expect(label).toHaveText("Your name");

    await context.close();
  });

  test("Buttons have focus visible styles", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Focus add button
    await page.locator("#add-btn").focus();
    
    // Check it has outline or other focus indicator (computed style)
    const hasOutline = await page.locator("#add-btn").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    
    // Focus should be visible
    expect(hasOutline).toBe(true);

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 4. ARIA and Screen Reader Support
// ---------------------------------------------------------------------------

// 5. Keyboard Shortcuts
// ---------------------------------------------------------------------------

test.describe("Keyboard Shortcuts", () => {
  test("Ctrl+A selects all in track input", async ({ browser }) => {
    const { page } = await joinAs(browser, "Alice");

    // Type something
    await page.fill("#track-input", "https://example.com/test");

    // Select all
    await page.keyboard.press("Control+a");

    // Check that text is selected
    const selection = await page.evaluate(() => {
      const input = document.querySelector("#track-input") as HTMLInputElement;
      return input?.selectionStart === 0 && input?.selectionEnd === input?.value.length;
    });
    
    expect(selection).toBe(true);

    await closePages(page);
  });
});

// ---------------------------------------------------------------------------
// 6. Multi-User Keyboard Interactions
// ---------------------------------------------------------------------------

test.describe("Multi-User Keyboard Interactions", () => {
  test("Two users can navigate independently with keyboard", async ({ browser }) => {
    const { page: pageA } = await joinAs(browser, "Alice");
    const { page: pageB } = await joinAs(browser, "Bob");

    // Alice navigates with Tab
    await pageA.locator("#track-input").focus();
    await pageA.keyboard.press("Tab");
    await expect(pageA.locator("#add-btn")).toBeFocused();

    // Bob navigates independently
    await pageB.locator("#volume-btn").focus();
    await expect(pageB.locator("#volume-btn")).toBeFocused();

    // Alice's focus should be unchanged
    await expect(pageA.locator("#add-btn")).toBeFocused();

    await closePages(pageA, pageB);
  });
});
