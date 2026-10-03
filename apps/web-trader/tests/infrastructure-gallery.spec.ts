import { expect, test } from "@playwright/test";

test("native infrastructure views update zones, routing and exact commission examples", async ({
  page,
}) => {
  await page.goto("/#infrastructure");
  const gallery = page.locator("#infrastructure");
  const views = gallery.getByRole("group", {
    name: "Infrastructure preview views",
  });
  const preview = gallery.getByRole("region", {
    name: "Interactive infrastructure preview",
  });
  const sources = gallery.locator(".ig-source-details");

  await expect(sources).not.toHaveAttribute("open");
  await expect(
    preview.locator('img[src^="/marketing/infrastructure/"]'),
  ).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Amsterdam, Servers AMS", exact: true })
    .press("Enter");
  await expect(
    preview.getByRole("img", { name: /router to Amsterdam, Servers AMS/ }),
  ).toBeVisible();
  await expect(preview.locator(".ig-zone-coverage")).toContainText(
    "FX · Metals · Crypto · Stocks",
  );

  await views.getByRole("button", { name: /^Symbol routing/ }).press("Enter");
  await expect(
    preview.getByRole("table", { name: "Illustrative EURUSD market depth" }),
  ).toContainText("1.08421");
  await preview
    .getByRole("button", { name: "XAUUSD", exact: true })
    .press("Enter");
  await expect(
    preview.getByRole("table", { name: "Illustrative XAUUSD market depth" }),
  ).toContainText("2648.20");
  await preview
    .getByRole("combobox", { name: "Routing model", exact: true })
    .selectOption("best");
  await expect(preview.locator(".ig-provider-enabled")).toHaveCount(1);
  await expect(preview.locator(".ig-aggregation-result")).toContainText(
    "Best-provider quotes",
  );

  await views.getByRole("button", { name: /^Quotes & markups/ }).press("Enter");
  await expect(preview.locator(".ig-commission-total")).toContainText("$7.00");
  const markups = preview.getByRole("group", {
    name: "Infrastructure example markup",
  });
  await markups
    .getByRole("button", { name: "$3.00", exact: true })
    .press("Enter");
  await expect(preview.locator(".ig-commission-total")).toContainText("$5.00");
  await expect(preview.locator(".ig-commercial-summary")).toContainText(
    "$30,000.00",
  );
  await preview
    .getByRole("combobox", { name: "Example group leverage", exact: true })
    .selectOption("1:200");
  await expect(
    preview.getByRole("combobox", {
      name: "Example group leverage",
      exact: true,
    }),
  ).toHaveValue("1:200");

  await sources.locator("summary").press("Enter");
  const sourceViewer = gallery.getByRole("region", {
    name: "Selected original infrastructure reference",
  });
  await expect(sourceViewer).toBeVisible();
  await expect(gallery.locator("[data-liquidity-reference]")).toHaveCount(7);
  await expect(
    gallery.getByRole("link", { name: /^Open original:/ }),
  ).toHaveCount(7);
  await gallery
    .getByRole("button", {
      name: "Preview Liquidity provider collection 03",
      exact: true,
    })
    .press("Space");
  await expect(sourceViewer).toBeFocused();
  await expect(sourceViewer.locator("img")).toHaveAttribute(
    "src",
    "/marketing/infrastructure/liquidity-provider-logos-three.png",
  );
  await expect(sourceViewer.locator("img")).toHaveCSS("object-fit", "contain");
  await expect(sourceViewer.locator("img")).not.toHaveAttribute(
    "style",
    /left:|top:/,
  );
  await sources.locator("summary").press("Enter");
  await expect(sourceViewer).toBeHidden();
  await expect(preview.locator(".ig-commission-total")).toContainText("$5.00");
});

test("native infrastructure and original references work on small screens with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#infrastructure");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const gallery = page.locator("#infrastructure");
    const views = gallery.getByRole("group", {
      name: "Infrastructure preview views",
    });
    for (const label of [
      /^Liquidity zones/,
      /^Symbol routing/,
      /^Quotes & markups/,
    ]) {
      await views.getByRole("button", { name: label }).click();
      const box = await gallery.locator(".ig-workspace").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await gallery.locator(".ig-source-details summary").click();
    await expect(gallery.locator(".ig-source-details")).toHaveAttribute(
      "open",
      "",
    );
    for (const reference of await gallery
      .locator("[data-liquidity-reference]")
      .all()) {
      const box = await reference.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await expect(
        reference.getByRole("link", { name: /^Open original:/ }),
      ).toHaveAttribute("target", "_blank");
    }
    await gallery
      .getByRole("button", {
        name: "Preview Liquidity provider collection 03",
        exact: true,
      })
      .click();
    const sourceViewer = gallery.getByRole("region", {
      name: "Selected original infrastructure reference",
    });
    await expect(sourceViewer).toBeFocused();
    await expect(sourceViewer.locator(".ig-source-toolbar")).toBeInViewport();
    await expect
      .poll(() =>
        sourceViewer.locator("img").evaluate((element) => {
          const image = element as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        }),
      )
      .toBe(true);
    const ratio = await sourceViewer.locator("img").evaluate((element) => {
      const image = element as HTMLImageElement;
      return (
        image.getBoundingClientRect().width /
        image.getBoundingClientRect().height
      );
    });
    expect(ratio).toBeCloseTo(776 / 336, 2);
    await gallery.locator(".ig-source-details summary").click();
    await expect(gallery.locator(".ig-source-details")).not.toHaveAttribute(
      "open",
      "",
    );
  }
});
