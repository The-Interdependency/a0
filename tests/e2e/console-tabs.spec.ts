import { test, expect, request, type Page } from "@playwright/test";

// Canonical contract: tab_ids that MUST render via a custom React component
// (data-renderer="custom"). This is the external source of truth — the test
// fails if any of these tabs falls back to the generic schema renderer.
// Update this list (and CUSTOM_TAB_RENDERERS in client/src/pages/console.tsx)
// together when adding or removing a custom-rendered console tab.
const REQUIRED_CUSTOM_TAB_IDS = new Set([
  "agents",
  "approval_scopes",
  "ws_modules",
  "docs",
  "sigma",
  // "cli_keys" is registered in the frontend but not yet returned by the API;
  // omitted here so the test does not fail on its absence. See follow-up #91.
]);

// Test user credentials. Created on the fly via /api/auth/register if absent.
const USER = {
  username: process.env.E2E_USERNAME || "tabtester",
  email: process.env.E2E_EMAIL || "tabtester@example.com",
  passphrase:
    process.env.E2E_PASSPHRASE || "correct horse battery staple test",
};

async function ensureUser(baseURL: string) {
  const ctx = await request.newContext({ baseURL });
  // 409 (already exists) is fine — login will succeed.
  await ctx.post("/api/auth/register", {
    data: {
      username: USER.username,
      email: USER.email,
      passphrase: USER.passphrase,
      displayName: "Tab Tester",
    },
    failOnStatusCode: false,
  });
  await ctx.dispose();
}

async function login(page: Page) {
  await page.goto("/login");
  // The login form has username + passphrase fields. Fill by stable selectors,
  // falling back to placeholders/types if data-testids aren't present.
  const usernameField = page
    .locator(
      '[data-testid="input-username"], input[name="username"], input[placeholder*="sername" i]'
    )
    .first();
  const passphraseField = page
    .locator(
      '[data-testid="input-passphrase"], input[name="passphrase"], input[type="password"]'
    )
    .first();
  await usernameField.fill(USER.username);
  await passphraseField.fill(USER.passphrase);
  const submit = page
    .locator(
      '[data-testid="button-sign-in"], [data-testid="button-login"], button[type="submit"]'
    )
    .first();
  await submit.click();
  // Login redirects to "/", then we manually navigate to /console.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await page.goto("/console");
}

test.describe("Console tabs render correctly", () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL!);
  });

  test("every API tab renders a tab-specific element (no silent placeholder)", async ({
    page,
    baseURL,
  }) => {
    await login(page);

    // The console must mount and the sidebar must be visible.
    await expect(page.locator('[data-testid="console-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="console-sidebar"]')).toBeVisible();

    // Cross-check the API list against the rendered sidebar so the test fails
    // loudly if a tab returned by the API doesn't even appear in the nav.
    const ctx = await request.newContext({ baseURL: baseURL! });
    const cookies = await page.context().cookies();
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const apiRes = await ctx.get("/api/v1/ui/structure", {
      headers: { cookie: cookieHeader },
    });
    expect(apiRes.ok()).toBeTruthy();
    const apiJson = (await apiRes.json()) as {
      tabs: Array<{ tab_id: string; sections?: unknown[] }>;
    };
    await ctx.dispose();
    expect(apiJson.tabs.length).toBeGreaterThan(5);

    const sidebarTabIds = await page.$$eval(
      '[data-testid^="sidebar-tab-"]',
      (els) =>
        els
          .map((e) => e.getAttribute("data-testid") || "")
          .map((id) => id.replace(/^sidebar-tab-/, ""))
          .filter(Boolean)
    );
    expect(sidebarTabIds.length).toBeGreaterThan(5);

    // Every API tab must appear in the sidebar.
    const missingFromSidebar = apiJson.tabs
      .map((t) => t.tab_id)
      .filter((id) => !sidebarTabIds.includes(id));
    expect(
      missingFromSidebar,
      `API tabs missing from sidebar: ${missingFromSidebar.join(", ")}`
    ).toEqual([]);

    // For each tab, click it and assert the rendered content carries a
    // tab-specific test-id and is NOT the silent-fallback "missing" path.
    const failures: string[] = [];
    for (const tabId of sidebarTabIds) {
      await page.locator(`[data-testid="sidebar-tab-${tabId}"]`).click();
      // The tab is rendered into both the mobile and desktop branches of the
      // console layout, so the test-id appears twice. Pick the one that is
      // actually visible at the current viewport.
      const content = page
        .locator(`[data-testid="tab-content-${tabId}"]:visible`)
        .first();
      try {
        await content.waitFor({ state: "visible", timeout: 8_000 });
      } catch {
        failures.push(`${tabId}: tab-content-${tabId} not visible`);
        continue;
      }
      const renderer = await content.getAttribute("data-renderer");
      if (renderer !== "custom" && renderer !== "generic") {
        failures.push(
          `${tabId}: data-renderer="${renderer}" (expected custom or generic)`
        );
        continue;
      }
      // If the tab is required to have a custom renderer, "generic" is a
      // regression — the entry was removed from CUSTOM_TAB_RENDERERS but
      // the API still returns this tab.
      if (REQUIRED_CUSTOM_TAB_IDS.has(tabId) && renderer !== "custom") {
        failures.push(
          `${tabId}: required custom renderer but data-renderer="${renderer}" — entry missing from CUSTOM_TAB_RENDERERS?`
        );
        continue;
      }
      // Sanity: the rendered tab is not totally empty.
      const text = (await content.innerText()).trim();
      if (text.length === 0) {
        failures.push(`${tabId}: rendered empty`);
      }
    }

    expect(
      failures,
      `Broken console tabs detected:\n  ${failures.join("\n  ")}`
    ).toEqual([]);
  });
});
