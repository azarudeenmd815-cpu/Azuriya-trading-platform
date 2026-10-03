import { expect, test } from "@playwright/test";

test("challenge stages use their own target and funded stage shows a payout cycle instead of qualification", async ({
  page,
}) => {
  await page.goto("/#platform");
  await page
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Prop firm", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Prop firm program preview",
  });
  const evaluation = preview.getByRole("region", {
    name: "Evaluation equity monitor",
  });
  await expect(evaluation.locator(".dp-target-row")).toContainText(
    "Evaluation target $4,000.00",
  );
  await expect(evaluation.locator(".dp-target-row")).toContainText(
    "31.00% complete",
  );
  await preview
    .getByRole("button", { name: "Verification stage", exact: true })
    .click();
  const verification = preview.getByRole("region", {
    name: "Verification equity monitor",
  });
  await expect(verification.locator(".dp-target-row")).toContainText(
    "Verification target $2,500.00",
  );
  await expect(verification.locator(".dp-target-row")).toContainText(
    "49.60% complete",
  );
  await expect(verification.locator(".dp-chart-target")).toHaveText(
    "5.00% profit target",
  );
  await preview
    .getByLabel("Verification profit target", { exact: true })
    .selectOption("6.00");
  await expect(verification.locator(".dp-target-row")).toContainText(
    "$3,000.00",
  );
  await expect(verification.locator(".dp-target-row")).toContainText(
    "41.33% complete",
  );
  await preview
    .getByRole("button", { name: "Funded stage", exact: true })
    .click();
  const funded = preview.getByRole("region", {
    name: "Funded account equity monitor",
  });
  await expect(funded.locator(".dp-target-row, .dp-progress")).toHaveCount(0);
  await expect(funded.locator(".dp-chart-target")).toHaveText(
    "Equity high-water mark",
  );
  const payout = funded.getByRole("group", {
    name: "Funded payout cycle metrics",
  });
  await expect(payout).toContainText("$992.00");
  await expect(payout).toContainText("Day 9 / 14");
  await expect(payout).toContainText("Payout request not submitted");
  await preview.getByRole("button", { name: "Payouts", exact: true }).click();
  await preview
    .getByLabel("Trader profit split", { exact: true })
    .selectOption("85.00");
  await preview
    .getByLabel("First payout eligibility", { exact: true })
    .selectOption("21");
  await expect(payout).toContainText("$1,054.00");
  await expect(payout).toContainText("Day 9 / 21");
  await preview
    .getByRole("button", {
      name: "$100,000.00 evaluation account",
      exact: true,
    })
    .click();
  await expect(payout).toContainText("$2,108.00");
  await preview
    .getByRole("button", { name: "Evaluation 1 stage", exact: true })
    .click();
  await expect(evaluation.locator(".dp-target-row")).toContainText("$8,000.00");
  await expect(evaluation.locator(".dp-target-row")).toContainText(
    "31.00% complete",
  );
});

test("prop firm presets and rule categories update the challenge preview without executing actions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#platform");
  await page
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Prop firm", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Prop firm program preview",
  });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("img", { name: /evaluation equity illustration/ }),
  ).toBeVisible();
  await preview
    .getByRole("button", {
      name: "$100,000.00 evaluation account",
      exact: true,
    })
    .click();
  await expect(
    preview.getByRole("region", { name: "Evaluation equity monitor" }),
  ).toContainText("$102,480.00");
  await preview
    .getByLabel("Evaluation profit target", { exact: true })
    .selectOption("10.00");
  await expect(
    preview.getByRole("region", { name: "Evaluation equity monitor" }),
  ).toContainText("$10,000.00");
  await preview
    .getByLabel("Challenge model", { exact: true })
    .selectOption("one-step");
  await expect(
    preview.getByLabel("Verification profit target", { exact: true }),
  ).toBeDisabled();
  await preview
    .getByRole("button", { name: "Risk rules", exact: true })
    .click();
  await preview
    .getByLabel("Drawdown model", { exact: true })
    .selectOption("equity-trailing");
  await preview
    .getByLabel("Daily loss limit", { exact: true })
    .selectOption("3.00");
  await expect(
    preview.getByRole("region", { name: "Challenge risk headroom" }),
  ).toContainText("$2,360.00");
  await expect(
    preview.getByRole("img", { name: /with trailing drawdown floor/ }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Payouts", exact: true }).click();
  await preview
    .getByLabel("Trader profit split", { exact: true })
    .selectOption("90.00");
  await preview
    .getByLabel("Payout frequency", { exact: true })
    .selectOption("30");
  await expect(
    preview.getByRole("region", { name: "Funded account payout preview" }),
  ).toContainText("90.00%");
  await expect(
    preview.getByRole("region", { name: "Funded account payout preview" }),
  ).toContainText("30 days");
  await preview
    .getByRole("button", { name: "Review program preview", exact: true })
    .click();
  await expect(preview.getByRole("status")).toContainText(
    "No challenge, funded account or payout was created",
  );
  await expect(
    preview.getByRole("region", { name: "Selected prop firm program rules" }),
  ).toContainText("90.00% profit share");
  await preview.locator(".dp-full-rules > summary").click();
  await expect(preview.locator(".dp-full-rules dl > div")).toHaveCount(25);
  await expect(preview.locator(".dp-enforcement")).toContainText(
    "Server safeguards always enforced",
  );
  await expect(
    preview.locator(
      ".dp-enforcement input, .dp-enforcement button, .dp-enforcement select",
    ),
  ).toHaveCount(0);
  await preview
    .getByLabel("Minimum payout request", { exact: true })
    .selectOption("500.00");
  await expect(preview.getByRole("status")).toHaveText(
    "Changes affect this demonstration only.",
  );
  expect(errors).toEqual([]);
});

test("prop firm settings stay contained and usable at 320px with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#platform");
  await page
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Prop firm", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Prop firm program preview",
  });
  await preview
    .getByRole("button", { name: "Risk rules", exact: true })
    .click();
  await preview
    .getByLabel("Weekend positions", { exact: true })
    .selectOption("allowed");
  await expect(
    preview.getByRole("region", { name: "Selected prop firm program rules" }),
  ).toContainText("Weekend holding");
  const geometry = await preview.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    controls: Array.from(
      element.querySelectorAll(
        "select, .dp-presets button, .dp-categories button, .dp-review-button",
      ),
    ).map((control) => control.getBoundingClientRect().height),
    transition: getComputedStyle(element.querySelector(".dp-progress > span")!)
      .transitionDuration,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.controls.every((height) => height >= 44)).toBe(true);
  expect(geometry.transition).toBe("0s");
});
