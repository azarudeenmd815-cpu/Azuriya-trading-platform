import { expect, test } from "@playwright/test";

test("community threads, pins and reactions update the selected conversation", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  await demo
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Community", exact: true })
    .click();
  const post = demo.locator('[data-message-id="market-1"]');
  const reaction = post.getByRole("button", {
    name: "React 📈 to Sara Chen's message",
    exact: true,
  });
  await reaction.click();
  await expect(reaction).toHaveAttribute("aria-pressed", "true");
  await expect(reaction).toContainText("9");
  await post
    .getByRole("button", {
      name: "Reply in thread to Sara Chen's message",
      exact: true,
    })
    .click();
  const thread = page.getByRole("dialog");
  await thread
    .getByRole("textbox", { name: "Reply to thread", exact: true })
    .fill("Added my session notes to this thread.");
  await thread
    .getByRole("button", { name: "Send thread reply", exact: true })
    .click();
  await expect(
    thread.getByRole("log", { name: "Thread replies", exact: true }),
  ).toContainText("Added my session notes to this thread.");
  await thread.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await demo
    .getByRole("button", { name: "Pinned messages", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("London open");
  await page.getByRole("dialog").press("Escape");
  await post
    .getByRole("button", { name: "Unpin Sara Chen's message", exact: true })
    .click();
  await expect(
    post.getByRole("button", { name: "Pin Sara Chen's message", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("voice room controls simulate joining, mute, deafening, sharing and leaving", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  await demo
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Community", exact: true })
    .click();
  await demo
    .getByRole("navigation", { name: "Demo community channels" })
    .getByRole("button", { name: "London session", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Join demo room", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Mute microphone preview", exact: true })
    .click();
  await expect(
    demo.getByRole("button", {
      name: "Unmute microphone preview",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo
    .getByRole("button", { name: "Deafen voice preview", exact: true })
    .click();
  await expect(
    demo.getByRole("button", { name: "Undeafen voice preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo
    .getByRole("button", { name: "Start screen sharing preview", exact: true })
    .click();
  await expect(
    demo.getByRole("button", {
      name: "Stop screen sharing preview",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(
    demo.getByRole("button", { name: "Join demo room", exact: true }),
  ).toBeVisible();
});

test("community channel creation, moderation and events are working local drafts", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  await demo
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Community", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Community settings", exact: true })
    .click();
  const settings = page.getByRole("dialog");
  await settings.getByLabel("New channel name").fill("session-reviews");
  await settings
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Community settings", exact: true })
    .click();
  await settings.getByRole("tab", { name: "Moderation", exact: true }).click();
  await settings.getByLabel("Enable community slow mode").check();
  await expect(settings.getByLabel("Enable community slow mode")).toBeChecked();
  await settings
    .getByRole("button", { name: "Timeout for 10 minutes", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Remove timeout", exact: true }),
  ).toBeVisible();
  await settings.press("Escape");
  await demo
    .getByRole("navigation", { name: "Demo community channels" })
    .getByRole("button", { name: /session-reviews/ })
    .click();
  await expect(
    demo.getByRole("textbox", {
      name: "Message #session-reviews",
      exact: true,
    }),
  ).toBeVisible();
  await demo
    .getByRole("button", { name: "Community events", exact: true })
    .click();
  const events = page.getByRole("dialog");
  await events
    .getByRole("button", { name: "RSVP", exact: true })
    .first()
    .click();
  await expect(
    events.getByRole("button", { name: "Going", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await events.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("team directory filters people, previews roles and opens the selected team community", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: /^Teams/ }).click();
  await demo.getByLabel("Filter demo by team").selectOption("Gold Elite");
  await expect(demo.locator(".dt-member")).toHaveCount(3);
  await demo.getByLabel("Search team members").fill("Maya");
  await expect(demo.locator(".dt-member")).toHaveCount(1);
  await demo
    .getByLabel("Community role for Maya Patel")
    .selectOption("Moderator");
  await expect(
    demo.getByRole("status").filter({ hasText: "Local role preview" }),
  ).toContainText("Maya Patel");
  await demo.getByLabel("Search team members").fill("no-such-member");
  await expect(
    demo.getByText("No matching members", { exact: true }),
  ).toBeVisible();
  await demo.getByLabel("Search team members").clear();
  await demo
    .getByRole("button", { name: "Role permissions", exact: true })
    .click();
  const permission = demo.getByRole("checkbox", {
    name: "Trader: Host voice sessions",
    exact: true,
  });
  await permission.check();
  await expect(permission).toBeChecked();
  await demo
    .getByRole("button", { name: "Events & resources", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Mark interested", exact: true })
    .click();
  await expect(
    demo.getByRole("button", { name: "You're interested", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo
    .getByRole("button", { name: "Open team channels", exact: true })
    .click();
  await expect(
    views.getByRole("button", { name: "Community", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(demo.locator(".az-stat")).toHaveCount(0);
  await views.getByRole("button", { name: /^Teams/ }).click();
  await demo.getByRole("button", { name: "Members", exact: true }).click();
  await expect(demo.getByLabel("Community role for Maya Patel")).toHaveValue(
    "Moderator",
  );
});

test("community message drafts and sent messages stay local across dashboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: "Community", exact: true }).click();
  const composer = demo.getByRole("textbox", {
    name: "Message #market-discussion",
    exact: true,
  });
  await composer.fill("Review the shared session notes");
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await views.getByRole("button", { name: "Community", exact: true }).click();
  await expect(composer).toHaveValue("Review the shared session notes");
  await composer.press("Enter");
  await expect(demo.locator(".dd-message-panel")).toContainText(
    "Review the shared session notes",
  );
  await expect(composer).toBeEmpty();
  await demo
    .getByRole("navigation", { name: "Demo community channels" })
    .getByRole("button", { name: /account-support/ })
    .click();
  await expect(demo.locator(".dd-message-panel")).toContainText(
    "Where can I check the status of my withdrawal request?",
  );
  await demo
    .getByRole("navigation", { name: "Demo community channels" })
    .getByRole("button", { name: /market-discussion/ })
    .click();
  await expect(demo.locator(".dd-message-panel")).toContainText(
    "Review the shared session notes",
  );
});

test("team and communication workspaces fit phones, tablets and desktop", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["Community", "Teams", "Overview"]) {
      await views
        .getByRole("button", {
          name: name === "Teams" ? /^Teams/ : name,
          exact: name !== "Teams",
        })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await expect(demo.locator(".az-stat")).toHaveCount(
        name === "Overview" ? 4 : 0,
      );
    }
  }
  await demo
    .getByRole("button", { name: /Open Community/, exact: false })
    .click();
  await expect(
    views.getByRole("button", { name: "Community", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
