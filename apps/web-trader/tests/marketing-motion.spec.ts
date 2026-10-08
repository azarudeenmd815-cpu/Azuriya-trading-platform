import { expect, test } from "@playwright/test";

test("logo rows move continuously and pause without duplicating accessible links", async ({
  page,
}) => {
  await page.goto("/");
  const loop = page.getByRole("region", {
    name: "Trading platform catalog",
    exact: true,
  });
  await loop.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(loop).toHaveAttribute("data-in-view", "true");
  const track = loop.locator(".az-logo-track");
  const start = await track.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() =>
      track.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(start);
  await expect(loop.getByRole("link")).toHaveCount(32);
  await expect(loop.locator(".az-logo-duplicate")).toHaveAttribute("inert", "");
  await loop
    .getByRole("button", { name: "Pause trading platform catalog" })
    .click();
  await expect(loop).toHaveAttribute("data-paused", "true");
  await expect
    .poll(() =>
      track.evaluate((element) => getComputedStyle(element).animationPlayState),
    )
    .toBe("paused");
  await loop
    .getByRole("button", { name: "Resume trading platform catalog" })
    .click();
  await page.locator("#pc-heading").click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await loop.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(loop).toHaveAttribute("data-paused", "false");
  await expect
    .poll(() =>
      track.evaluate((element) => getComputedStyle(element).animationPlayState),
    )
    .toBe("running");
  await page.getByText("See all 32 platforms", { exact: true }).click();
  await expect(
    page.locator("#trading-platforms .az-logo-details"),
  ).toHaveAttribute("open", "");
  await expect(
    page.locator("#trading-platforms .az-logo-directory a"),
  ).toHaveCount(32);
});

test("scroll reveals become visible and reduced motion disables both effects", async ({
  page,
}) => {
  await page.goto("/");
  const community = page.locator("#communities");
  const communityHeading = community.locator(".az-section-intro");
  await expect(community).toHaveClass(/az-scroll-pending/);
  await expect(communityHeading).toHaveClass(/az-scroll-stagger-pending/);
  await community.scrollIntoViewIfNeeded();
  await expect(community).not.toHaveClass(/az-scroll-pending/);
  await expect(communityHeading).not.toHaveClass(/az-scroll-stagger-pending/);
  await expect
    .poll(() =>
      community.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".az-scroll-pending")).toHaveCount(0);
  const track = page.locator(".az-logo-track").first();
  await expect
    .poll(() =>
      track.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe("none");
  await expect(page.locator(".az-logo-pause").first()).toBeHidden();
});

test("dashboard fits the supplied MacBook display and preserves the camera above the back office", async ({
  page,
}) => {
  await page.goto("/");
  const laptop = page.locator(".az-laptop-device");
  const lid = laptop.locator(".az-laptop-lid");
  const screen = page.locator("iframe.az-laptop-dashboard-iframe");
  await laptop.scrollIntoViewIfNeeded();
  await expect(laptop).toHaveAttribute("data-laptop-open-progress", "1.000");

  const [lidBox, screenBox] = await Promise.all([
    lid.boundingBox(),
    screen.boundingBox(),
  ]);
  expect(lidBox).not.toBeNull();
  expect(screenBox).not.toBeNull();

  const layers = await lid.evaluate((element) => {
    const frame = element.querySelector(".az-laptop-frame-lid")!;
    const screen = element.querySelector(".az-laptop-dashboard-iframe")!;
    return {
      cameraPatch: getComputedStyle(element, "::before").content,
      frameZIndex: Number(getComputedStyle(frame).zIndex),
      screenZIndex: Number(getComputedStyle(screen).zIndex),
      framePointerEvents: getComputedStyle(frame).pointerEvents,
    };
  });
  expect(layers.cameraPatch).toBe("none");
  expect(layers.frameZIndex).toBeGreaterThan(layers.screenZIndex);
  expect(layers.framePointerEvents).toBe("none");

  const screenCorners = await screen.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      bottomLeft: style.borderBottomLeftRadius,
      bottomRight: style.borderBottomRightRadius,
    };
  });
  expect(screenCorners).toEqual({
    bottomLeft: "0px",
    bottomRight: "0px",
  });

  const sidebar = page
    .frameLocator("iframe.az-laptop-dashboard-iframe")
    .locator(".az-dash-sidebar");
  await expect(
    page
      .frameLocator("iframe.az-laptop-dashboard-iframe")
      .locator(".az-demo-shell"),
  ).toHaveCSS("border-bottom-left-radius", "0px");
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.y - screenBox!.y).toBeLessThanOrEqual(1.5);
  await expect
    .poll(() =>
      sidebar.evaluate((element) => getComputedStyle(element).scrollbarWidth),
    )
    .toBe("none");
  const preview = page.frameLocator("iframe.az-laptop-dashboard-iframe");
  await expect(preview.locator(".az-dash-preview-brand")).toHaveText(
    "BACK OFFICE",
  );
  await expect(preview.locator(".az-dash-preview-brand > svg")).toHaveCount(1);
});

test("desktop dashboard scales into the supplied laptop and keeps its sidebar fixed", async ({
  page,
}) => {
  await page.goto("/");
  const laptop = page.locator(".az-laptop-device");
  const laptopLid = laptop.locator(".az-laptop-lid");
  const laptopScreen = page.locator("iframe.az-laptop-dashboard-iframe");
  const laptopImage = page.locator("img.az-laptop-frame-lid");
  const laptopBase = page.locator("img.az-laptop-frame-base");
  const preview = page.frameLocator("iframe.az-laptop-dashboard-iframe");
  const dashboard = preview.locator(".az-dashboard.az-laptop-screen");
  const mainContent = preview.locator(".az-dash-content");

  const previewResponse = await page.request.get("/dashboard-preview");
  expect(previewResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  const homeResponse = await page.request.get("/");
  expect(homeResponse.headers()["x-frame-options"]).toBe("DENY");
  const sourceDimensions = await page.evaluate(async () => {
    const source = new Image();
    source.src = "/marketing/apple-macbookpro14-front.png";
    await source.decode();
    return { width: source.naturalWidth, height: source.naturalHeight };
  });
  expect(sourceDimensions).toEqual({ width: 3944, height: 2564 });
  await expect(laptop).toHaveAttribute("data-laptop-open-progress", "0.000");
  await expect
    .poll(() =>
      laptop.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--az-laptop-lid-angle")
          .trim(),
      ),
    )
    .toBe("90deg");
  await expect
    .poll(() =>
      laptopLid.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        return transform === "none" ? 0 : new DOMMatrix(transform).m23;
      }),
    )
    .toBeGreaterThan(0);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 820 });
    const scrollToProgress = async (topFraction: number) => {
      const target = await laptop.evaluate(
        (element, fraction) =>
          element.getBoundingClientRect().top +
          window.scrollY -
          window.innerHeight * fraction,
        topFraction,
      );
      await page.evaluate((top) => window.scrollTo(0, top), target);
    };

    await scrollToProgress(0.12);
    await expect(laptop).toHaveAttribute("data-laptop-open-progress", "1.000");
    await expect
      .poll(() =>
        laptop.evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue("--az-laptop-lid-angle")
            .trim(),
        ),
      )
      .toBe("7deg");
    await expect
      .poll(() =>
        laptopLid.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          return transform === "none" ? 0 : new DOMMatrix(transform).m23;
        }),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        laptopLid.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          return transform === "none" ? 0 : new DOMMatrix(transform).m23;
        }),
      )
      .toBeLessThan(0.2);

    const imageLayers = await laptopLid.evaluate((element) => {
      const frame = element.querySelector(".az-laptop-frame-lid");
      const screen = element.querySelector(".az-laptop-dashboard-iframe");
      if (
        !(screen instanceof HTMLIFrameElement) ||
        !(frame instanceof HTMLImageElement)
      )
        throw new Error("Laptop display layers not found");
      const screenStyle = getComputedStyle(screen);
      const frameStyle = getComputedStyle(frame);
      return {
        src: frame.getAttribute("src"),
        frameZIndex: Number.parseInt(frameStyle.zIndex, 10),
        screenZIndex: Number.parseInt(screenStyle.zIndex, 10),
        objectFit: frameStyle.objectFit,
      };
    });
    expect(imageLayers.src).toContain("apple-macbookpro14-front.png");
    expect(imageLayers.frameZIndex).toBeGreaterThan(imageLayers.screenZIndex);
    expect(imageLayers.objectFit).toBe("contain");
    await expect(laptop).toBeVisible();
    await expect(laptopScreen).toBeVisible();
    await expect(laptopImage).toBeVisible();
    await expect(laptopBase).toBeVisible();
    await expect
      .poll(() =>
        laptopImage.evaluate(
          (element: HTMLImageElement) => element.naturalWidth,
        ),
      )
      .toBeGreaterThan(0);
    const imageDimensions = await laptopImage.evaluate(
      (element: HTMLImageElement) => ({
        width: element.naturalWidth,
        height: element.naturalHeight,
      }),
    );
    // Next/Image serves smaller responsive derivatives of the exact PNG.
    // The optimized derivative rounds height to a whole pixel.
    expect(
      Math.abs(imageDimensions.height - imageDimensions.width * (2564 / 3944)),
    ).toBeLessThanOrEqual(1);
    await expect(
      page.getByText("Scroll the page to open · scroll inside to explore"),
    ).toBeVisible();
    await expect(dashboard).toHaveAttribute("data-dashboard-view", "Overview");
    await expect
      .poll(() => preview.locator("html").evaluate(() => window.innerWidth))
      .toBe(1200);

    const screenGeometry = await laptopScreen.evaluate((element) => {
      if (!(element instanceof HTMLElement))
        throw new Error("Laptop screen not found");
      const lid = element.offsetParent;
      if (!(lid instanceof HTMLElement))
        throw new Error("Laptop lid not found");
      const style = getComputedStyle(element);
      const transform = style.transform;
      const scale = transform === "none" ? 1 : new DOMMatrix(transform).a;
      return {
        left: Number.parseFloat(style.left) / lid.clientWidth,
        top: Number.parseFloat(style.top) / lid.clientHeight,
        width: (Number.parseFloat(style.width) * scale) / lid.clientWidth,
        heightPixels: Number.parseFloat(style.height) * scale,
        lidHeight: lid.clientHeight,
      };
    });
    expect(screenGeometry.left).toBeCloseTo(0.116633, 3);
    expect(screenGeometry.top).toBeCloseTo(0.117005, 3);
    expect(screenGeometry.width).toBeCloseTo(0.766734, 3);
    // Small viewports round the CSS aspect-ratio height to clientHeight pixels.
    expect(
      Math.abs(
        screenGeometry.heightPixels - 0.761695 * screenGeometry.lidHeight,
      ),
    ).toBeLessThanOrEqual(1);

    const baseOffset = await laptopBase.evaluate(
      (element) =>
        element.getBoundingClientRect().top -
        element.closest(".az-laptop-device")!.getBoundingClientRect().top,
    );
    await scrollToProgress(0.94);
    await expect(laptop).toHaveAttribute("data-laptop-open-progress", "0.000");
    await expect
      .poll(() =>
        laptop.evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue("--az-laptop-lid-angle")
            .trim(),
        ),
      )
      .toBe("90deg");
    await expect
      .poll(() =>
        laptopLid.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          return transform === "none" ? 0 : new DOMMatrix(transform).m23;
        }),
      )
      .toBeGreaterThan(0.9);
    const closedBaseOffset = await laptopBase.evaluate(
      (element) =>
        element.getBoundingClientRect().top -
        element.closest(".az-laptop-device")!.getBoundingClientRect().top,
    );
    expect(Math.abs(closedBaseOffset - baseOffset)).toBeLessThan(0.5);
    await scrollToProgress(0.12);
    await expect(laptop).toHaveAttribute("data-laptop-open-progress", "1.000");

    const dimensions = await mainContent.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
    const sidebar = preview.locator(".az-dash-sidebar");
    const sidebarBefore = await sidebar.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    await mainContent.evaluate((element) => element.scrollTo(0, 420));
    await expect
      .poll(() => mainContent.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const sidebarAfter = await sidebar.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(Math.abs(sidebarAfter - sidebarBefore)).toBeLessThan(0.5);
    const desktopLayout = await dashboard.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns,
      navDirection: getComputedStyle(
        element.querySelector(".az-dash-sidebar nav")!,
      ).flexDirection,
      workspaceDisplay: getComputedStyle(
        element.querySelector(".az-workspace")!,
      ).display,
    }));
    expect(desktopLayout.columns.startsWith("188px")).toBe(true);
    expect(desktopLayout.navDirection).toBe("column");
    expect(desktopLayout.workspaceDisplay).not.toBe("none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("logo loops and directories fit phone, tablet and desktop widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of [
      "Liquidity provider options",
      "Trading platform catalog",
    ]) {
      const loop = page.getByRole("region", { name: label, exact: true });
      await loop.scrollIntoViewIfNeeded();
      const bounds = await loop.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
