import { expect, test } from "@playwright/test";

test("team permission drafts stay isolated and resources open their channel context", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: /^Teams/ }).click();
  const team = demo.getByLabel("Filter demo by team");
  await team.selectOption("Gold Elite");
  await expect(
    demo.getByLabel("Community role for Alex Morgan"),
  ).toBeDisabled();
  await demo
    .getByRole("button", { name: "Role permissions", exact: true })
    .click();
  const permission = demo.getByRole("checkbox", {
    name: "Trader: Host voice sessions",
    exact: true,
  });
  await expect(permission).not.toBeChecked();
  await permission.check();
  await team.selectOption("FX Intraday");
  await expect(permission).not.toBeChecked();
  await team.selectOption("Gold Elite");
  await expect(permission).toBeChecked();
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await views.getByRole("button", { name: /^Teams/ }).click();
  await expect(permission).toBeChecked();

  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const hitArea = permission.locator("xpath=..");
    const target = await hitArea.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }

  for (const resource of [
    {
      name: "Community onboarding",
      channel: "announcements",
      pins: true,
      context: "Welcome to the Azuriya workspace",
    },
    {
      name: "Funding & account support",
      channel: "account-support",
      pins: true,
      context: "Open Funding, select Withdrawals",
    },
    {
      name: "Market session discussion",
      channel: "market-discussion",
      pins: false,
      context: "London open is approaching",
    },
  ]) {
    await demo
      .getByRole("button", { name: "Events & resources", exact: true })
      .click();
    await demo.getByRole("button", { name: new RegExp(resource.name) }).click();
    await expect(
      views.getByRole("button", { name: "Community", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(demo.locator(".dc-community-channel-heading h3")).toHaveText(
      resource.channel,
    );
    if (resource.pins) {
      const pins = page.getByRole("dialog", {
        name: "Pinned messages",
        exact: true,
      });
      await expect(pins).toContainText(`#${resource.channel}`);
      await expect(pins).toContainText(resource.context);
      await pins.press("Escape");
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        demo.getByRole("log", {
          name: `${resource.channel} messages`,
          exact: true,
        }),
      ).toContainText(resource.context);
    }
    await views.getByRole("button", { name: /^Teams/ }).click();
  }
});

test("community direct messages, search, attachments, polls and responsive presence work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: "Community", exact: true }).click();
  const rail = demo.getByRole("complementary", {
    name: "Member presence",
    exact: true,
  });
  await expect(rail).toBeVisible();
  const chart = demo
    .locator(".dc-community-attachment-chart .dc-community-chart")
    .first();
  const icon = await chart.locator("figcaption svg").boundingBox();
  const drawing = await chart.locator(":scope > svg").boundingBox();
  expect(icon).not.toBeNull();
  expect(icon!.width).toBeLessThanOrEqual(20);
  expect(icon!.height).toBeLessThanOrEqual(20);
  expect(drawing).not.toBeNull();
  expect(drawing!.height).toBeGreaterThan(100);

  const notifications = demo.getByRole("button", {
    name: "Mute channel notifications",
    exact: true,
  });
  await notifications.click();
  const unmute = demo.getByRole("button", {
    name: "Unmute channel notifications",
    exact: true,
  });
  await expect(unmute).toHaveAttribute("aria-pressed", "true");
  await unmute.click();
  await expect(notifications).toHaveAttribute("aria-pressed", "false");

  const poll = demo.locator(".dc-community-poll");
  const gold = poll.getByRole("button", {
    name: "Vote for Gold session map",
    exact: true,
  });
  const fx = poll.getByRole("button", {
    name: "Vote for FX market context",
    exact: true,
  });
  await gold.click();
  await expect(gold).toHaveAttribute("aria-pressed", "true");
  await expect(poll).toContainText("19 votes");
  await fx.click();
  await expect(fx).toHaveAttribute("aria-pressed", "true");
  await expect(gold).toHaveAttribute("aria-pressed", "false");
  await expect(poll).toContainText("You voted for FX market context");
  await fx.click();
  await expect(poll).toContainText("18 votes");

  await demo
    .getByRole("button", { name: "Open session chart attachment", exact: true })
    .click();
  const chartDialog = page.getByRole("dialog", {
    name: "Session chart",
    exact: true,
  });
  await expect(
    chartDialog.getByRole("img", {
      name: /Annotated Gold session candlestick chart/,
    }),
  ).toBeVisible();
  await chartDialog.press("Escape");

  await rail
    .getByRole("button", { name: "Message Sara Chen", exact: true })
    .click();
  const composer = demo.getByRole("textbox", {
    name: "Message Sara Chen",
    exact: true,
  });
  await composer.fill("Please review the private session notes.");
  await composer.press("Enter");
  const conversation = demo.getByRole("log", {
    name: "Sara Chen messages",
    exact: true,
  });
  await expect(conversation).toContainText(
    "Please review the private session notes.",
  );
  await expect(composer).toBeEmpty();
  await demo
    .getByLabel("Search messages", { exact: true })
    .fill("private session notes");
  await expect(conversation.locator(".dc-community-message")).toHaveCount(1);
  await demo
    .getByLabel("Search messages", { exact: true })
    .fill("does-not-exist-in-any-message");
  await expect(conversation).toContainText("No matching messages");
  await demo
    .getByRole("button", { name: "Clear message search", exact: true })
    .click();
  await expect(conversation.locator(".dc-community-message")).toHaveCount(3);
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await views.getByRole("button", { name: "Community", exact: true }).click();
  await expect(conversation).toContainText(
    "Please review the private session notes.",
  );

  await demo
    .getByRole("navigation", { name: "Demo community channels" })
    .getByRole("button", { name: /announcements/ })
    .click();
  await demo
    .getByRole("button", {
      name: "Open session briefing attachment",
      exact: true,
    })
    .click();
  const file = page.getByRole("dialog", {
    name: "Session briefing",
    exact: true,
  });
  await expect(file).toContainText("Research notes & community checklist");
  await expect(file.getByRole("listitem")).toHaveCount(4);
  await file.press("Escape");

  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(rail).toBeHidden();
  await demo
    .getByRole("button", { name: "Community members", exact: true })
    .click();
  const members = page.getByRole("dialog", {
    name: "Community members",
    exact: true,
  });
  await expect(
    members.getByRole("button", { name: "Message Sara Chen", exact: true }),
  ).toBeVisible();
  await members.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("community drafts and poll state survive view changes and deafen mutes the microphone", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  await demo
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Community", exact: true })
    .click();
  const channels = demo.getByRole("navigation", {
    name: "Demo community channels",
  });
  const composer = demo.getByRole("textbox", {
    name: "Message #market-discussion",
    exact: true,
  });
  await composer.fill("Keep this session draft while checking the voice room.");
  await demo
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Session briefing.pdf", exact: true })
    .click();
  await expect(demo.locator(".dc-community-draft-file")).toContainText(
    "Session briefing.pdf",
  );
  await channels
    .getByRole("button", { name: "London session", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Join demo room", exact: true })
    .click();
  await expect(
    demo.getByRole("button", { name: "Mute microphone preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await demo
    .getByRole("button", { name: "Deafen voice preview", exact: true })
    .click();
  const deafenedMic = demo.getByRole("button", {
    name: "Microphone muted while deafened",
    exact: true,
  });
  await expect(deafenedMic).toHaveAttribute("aria-pressed", "true");
  await expect(deafenedMic).toBeDisabled();
  await expect(
    demo.getByRole("button", { name: "Undeafen voice preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo
    .getByRole("button", { name: "Undeafen voice preview", exact: true })
    .click();
  await expect(
    demo.getByRole("button", { name: "Mute microphone preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await channels.getByRole("button", { name: /market-discussion/ }).click();
  await expect(composer).toHaveValue(
    "Keep this session draft while checking the voice room.",
  );
  await expect(demo.locator(".dc-community-draft-file")).toContainText(
    "Session briefing.pdf",
  );

  const saraPost = demo.locator('[data-message-id="market-1"]');
  await saraPost
    .getByRole("button", {
      name: "Reply in thread to Sara Chen's message",
      exact: true,
    })
    .click();
  let thread = page.getByRole("dialog", {
    name: "Message thread",
    exact: true,
  });
  await thread
    .getByRole("textbox", { name: "Reply to thread", exact: true })
    .fill("A thread draft that is not ready to send.");
  await thread.press("Escape");
  await saraPost
    .getByRole("button", {
      name: "Reply in thread to Sara Chen's message",
      exact: true,
    })
    .click();
  thread = page.getByRole("dialog", { name: "Message thread", exact: true });
  await expect(
    thread.getByRole("textbox", { name: "Reply to thread", exact: true }),
  ).toHaveValue("A thread draft that is not ready to send.");
  await thread.press("Escape");

  const alexPost = demo.locator('[data-message-id="market-2"]');
  await alexPost
    .getByRole("button", {
      name: "Add thumbs-up reaction to Alex Morgan's message",
      exact: true,
    })
    .click();
  const newReaction = alexPost.getByRole("button", {
    name: "React 👍 to Alex Morgan's message",
    exact: true,
  });
  await expect(newReaction).toHaveAttribute("aria-pressed", "true");
  await expect(newReaction).toContainText("1");
  const vote = alexPost.getByRole("button", {
    name: "Vote for Gold session map",
    exact: true,
  });
  await vote.click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await channels.getByRole("button", { name: /account-support/ }).click();
  await channels.getByRole("button", { name: /market-discussion/ }).click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await demo
    .getByLabel("Search messages", { exact: true })
    .fill("unmatched-poll-search");
  await expect(alexPost).toHaveCount(0);
  await demo
    .getByRole("button", { name: "Clear message search", exact: true })
    .click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await alexPost
    .getByRole("button", { name: "Pin Alex Morgan's message", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "Pinned messages", exact: true })
    .click();
  const pins = page.getByRole("dialog", {
    name: "Pinned messages",
    exact: true,
  });
  await expect(
    pins.getByRole("button", {
      name: "Vote for Gold session map",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await pins
    .getByRole("button", { name: "Vote for FX market context", exact: true })
    .click();
  await pins.press("Escape");
  await expect(
    alexPost.getByRole("button", {
      name: "Vote for FX market context",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(vote).toHaveAttribute("aria-pressed", "false");
});
