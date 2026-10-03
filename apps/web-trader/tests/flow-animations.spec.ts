import { expect, test } from "@playwright/test";

test("every routing track moves, global pause freezes the whole network, and resume continues it", async ({
  page,
}) => {
  await page.goto("/");
  const packets = page.locator("[data-flow-track]");
  expect(await packets.count()).toBeGreaterThanOrEqual(12);
  await expect(page.locator("[data-copy-packet]")).toHaveCount(5);

  const initialOffsets = await packets.evaluateAll((tracks) =>
    tracks
      .filter((track) => {
        const svg = track.closest("svg")!.getBoundingClientRect();
        return svg.width > 0 && svg.height > 0;
      })
      .map((track) => ({
        id: track.getAttribute("data-flow-track"),
        offset: getComputedStyle(track).strokeDashoffset,
      })),
  );
  await expect
    .poll(
      async () => {
        const currentOffsets = await packets.evaluateAll((tracks) =>
          tracks
            .filter((track) => {
              const svg = track.closest("svg")!.getBoundingClientRect();
              return svg.width > 0 && svg.height > 0;
            })
            .map((track) => ({
              id: track.getAttribute("data-flow-track"),
              offset: getComputedStyle(track).strokeDashoffset,
            })),
        );
        return (
          currentOffsets.length === initialOffsets.length &&
          currentOffsets.every(
            ({ id, offset }, index) =>
              id === initialOffsets[index].id &&
              offset !== initialOffsets[index].offset,
          )
        );
      },
      { timeout: 6000 },
    )
    .toBe(true);

  await page
    .getByRole("button", { name: "Pause all flow animations", exact: true })
    .click();
  const allParticles = page.locator("[data-flow-track], [data-copy-packet]");
  await expect
    .poll(() =>
      allParticles.evaluateAll((tracks) =>
        tracks
          .filter((track) => {
            const svg = track.closest("svg");
            if (!svg) return true;
            const box = svg.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          })
          .every(
            (track) => getComputedStyle(track).animationPlayState === "paused",
          ),
      ),
    )
    .toBe(true);

  const stoppedOffsets = await packets.evaluateAll((tracks) =>
    tracks
      .filter((track) => {
        const svg = track.closest("svg")!.getBoundingClientRect();
        return svg.width > 0 && svg.height > 0;
      })
      .map((track) => ({
        id: track.getAttribute("data-flow-track"),
        offset: getComputedStyle(track).strokeDashoffset,
      })),
  );
  await page
    .locator("#copy-trading")
    .getByRole("button", { name: "FX Intraday", exact: true })
    .click();
  await expect(page.locator("#copy-trading")).toContainText("JAMES-FX-01");
  expect(
    await packets.evaluateAll((tracks) =>
      tracks
        .filter((track) => {
          const svg = track.closest("svg")!.getBoundingClientRect();
          return svg.width > 0 && svg.height > 0;
        })
        .map((track) => ({
          id: track.getAttribute("data-flow-track"),
          offset: getComputedStyle(track).strokeDashoffset,
        })),
    ),
  ).toEqual(stoppedOffsets);

  await page
    .getByRole("button", { name: "Resume all flow animations", exact: true })
    .click();
  await expect
    .poll(() =>
      allParticles.evaluateAll((tracks) =>
        tracks
          .filter((track) => {
            const svg = track.closest("svg");
            if (!svg) return true;
            const box = svg.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          })
          .every(
            (track) => getComputedStyle(track).animationPlayState === "running",
          ),
      ),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const resumedOffsets = await packets.evaluateAll((tracks) =>
        tracks
          .filter((track) => {
            const svg = track.closest("svg")!.getBoundingClientRect();
            return svg.width > 0 && svg.height > 0;
          })
          .map((track) => ({
            id: track.getAttribute("data-flow-track"),
            offset: getComputedStyle(track).strokeDashoffset,
          })),
      );
      return (
        resumedOffsets.length === stoppedOffsets.length &&
        resumedOffsets.every(
          ({ id, offset }, index) =>
            id === stoppedOffsets[index].id &&
            offset !== stoppedOffsets[index].offset,
        )
      );
    })
    .toBe(true);
});

test("reduced motion keeps the wiring and removes all moving particles", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const packets = page.locator("[data-flow-track], [data-copy-packet]");
  expect(await packets.count()).toBeGreaterThanOrEqual(17);
  expect(
    await packets.evaluateAll((tracks) =>
      tracks.every(
        (track) =>
          getComputedStyle(track).display === "none" &&
          getComputedStyle(track).animationName === "none",
      ),
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".af-rail")
      .evaluateAll((rails) =>
        rails.every((rail) => getComputedStyle(rail).display !== "none"),
      ),
  ).toBe(true);
  await expect(page.locator(".wg-route-branches")).toBeVisible();
});

test("funding and admin paths remain connected to their nodes at desktop and mobile widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 1512]) {
    await page.setViewportSize({ width, height: 982 });
    const geometry = await page.evaluate(() => {
      const center = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const endpoints = (path: SVGPathElement) => {
        const matrix = path.getScreenCTM()!;
        const start = path.getPointAtLength(0).matrixTransform(matrix);
        const end = path
          .getPointAtLength(path.getTotalLength())
          .matrixTransform(matrix);
        return {
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
        };
      };
      const funding = document.querySelector(".og-funding-diagram")!;
      const rails = [
        ...funding.querySelectorAll(".og-payment-rails > span"),
      ].map(center);
      const accounts = [
        ...funding.querySelectorAll(".og-funding-accounts > .og-platform-mark"),
      ].map(center);
      const wallet = center(funding.querySelector(".og-wallet-mark")!);
      const fundingRoutes = [
        ...funding.querySelectorAll<SVGPathElement>(
          '[data-flow-diagram="funding-deposit"] [data-flow-track]',
        ),
      ].map(endpoints);
      const admin = document.querySelector(".og-backend-network")!;
      const adminSources = [
        ...admin.querySelectorAll(".og-backend-platforms > div"),
      ].map(center);
      const hub = admin.querySelector(".og-admin-hub")!.getBoundingClientRect();
      const adminRoutes = [
        ...admin.querySelectorAll<SVGPathElement>("[data-flow-track]"),
      ].map(endpoints);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        rails,
        accounts,
        wallet,
        fundingRoutes,
        adminSources,
        adminRoutes,
        adminHub: { x: hub.x + hub.width / 2, y: hub.y },
      };
    });
    expect(geometry.overflow, `overflow at ${width}px`).toBe(false);
    expect(geometry.fundingRoutes).toHaveLength(4);
    expect(geometry.adminRoutes).toHaveLength(4);
    for (let index = 0; index < 2; index++) {
      expect(geometry.fundingRoutes[index].start.x).toBeCloseTo(
        geometry.rails[index].x,
        0,
      );
      expect(geometry.fundingRoutes[index].start.y).toBeCloseTo(
        geometry.rails[index].y,
        0,
      );
      expect(geometry.fundingRoutes[index].end.x).toBeCloseTo(
        geometry.wallet.x,
        0,
      );
      expect(geometry.fundingRoutes[index + 2].end.x).toBeCloseTo(
        geometry.accounts[index].x,
        0,
      );
      expect(geometry.fundingRoutes[index + 2].end.y).toBeCloseTo(
        geometry.accounts[index].y,
        0,
      );
    }
    for (let index = 0; index < 4; index++) {
      expect(geometry.adminRoutes[index].start.x).toBeCloseTo(
        geometry.adminSources[index].x,
        0,
      );
      expect(geometry.adminRoutes[index].end.x).toBeCloseTo(
        geometry.adminHub.x,
        0,
      );
      expect(geometry.adminRoutes[index].end.y).toBeCloseTo(
        geometry.adminHub.y,
        0,
      );
    }
  }
});

test("liquidity, platform and community wiring reaches every source and destination", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 1512]) {
    await page.setViewportSize({ width, height: 982 });
    const connections = await page.evaluate(() => {
      type Point = { x: number; y: number };
      type Connection = {
        id: string;
        start: Point;
        end: Point;
        source: Point;
        destination: Point;
      };
      const links: Connection[] = [];
      const anchor = (
        element: Element,
        edge: "top" | "bottom" | "left" | "right",
      ): Point => {
        const box = element.getBoundingClientRect();
        const middle = {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
        if (edge === "top") return { ...middle, y: box.top };
        if (edge === "bottom") return { ...middle, y: box.bottom };
        if (edge === "left") return { ...middle, x: box.left };
        return { ...middle, x: box.right };
      };
      const addRoutes = (
        selector: string,
        sources: Point[],
        destinations: Point[],
      ) => {
        const paths = [
          ...document.querySelectorAll<SVGPathElement>(selector),
        ].filter((path) => {
          const svg = path.closest("svg")!.getBoundingClientRect();
          return svg.width > 0 && svg.height > 0;
        });
        paths.forEach((path, index) => {
          const matrix = path.getScreenCTM()!;
          const start = path.getPointAtLength(0).matrixTransform(matrix);
          const end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(matrix);
          links.push({
            id: path.getAttribute("data-flow-track")!,
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            source: sources[index],
            destination: destinations[index],
          });
        });
      };

      const mobileLiquidity = innerWidth < 768;
      const liquidityHub = document.querySelector(".ln-routing-hub")!;
      const accountAnchors = [
        ...document.querySelectorAll(".ln-account-node"),
      ].map((node) => anchor(node, mobileLiquidity ? "bottom" : "right"));
      const providerAnchors = [
        ...document.querySelectorAll(".ln-provider-node"),
      ].map((node) => anchor(node, mobileLiquidity ? "top" : "left"));
      const liquidityInput = anchor(
        liquidityHub,
        mobileLiquidity ? "top" : "left",
      );
      const liquidityOutput = anchor(
        liquidityHub,
        mobileLiquidity ? "bottom" : "right",
      );
      addRoutes(
        '[data-flow-diagram^="liquidity-input"] [data-flow-track]',
        accountAnchors,
        Array(3).fill(liquidityInput),
      );
      addRoutes(
        '[data-flow-diagram^="liquidity-output"] [data-flow-track]',
        Array(3).fill(liquidityOutput),
        providerAnchors,
      );

      const platformHub = document.querySelector(".pc-architecture-hub")!;
      const platformAnchors = [
        ...document.querySelectorAll(".pc-architecture-platform"),
      ].map((node) => anchor(node, "right"));
      const operationAnchors = [
        ...document.querySelectorAll(".pc-architecture-service"),
      ].map((node) => anchor(node, "left"));
      addRoutes(
        '[data-flow-diagram="platform-input"] [data-flow-track]',
        platformAnchors,
        Array(3).fill(anchor(platformHub, "left")),
      );
      addRoutes(
        '[data-flow-diagram="platform-output"] [data-flow-track]',
        Array(3).fill(anchor(platformHub, "right")),
        operationAnchors,
      );

      const communityOwner = anchor(
        document.querySelector(".az-hierarchy-owner")!,
        "bottom",
      );
      const teamAnchors = [
        ...document.querySelectorAll(".az-hierarchy-teams > div"),
      ].map((node) => anchor(node, "top"));
      addRoutes(
        '[data-flow-diagram="community-teams"] [data-flow-track]',
        Array(3).fill(communityOwner),
        teamAnchors,
      );
      return links;
    });

    expect(connections, `visible route count at ${width}px`).toHaveLength(15);
    for (const connection of connections) {
      const label = `${connection.id} at ${width}px`;
      expect(
        Math.abs(connection.start.x - connection.source.x),
        `${label}: source x`,
      ).toBeLessThan(1);
      expect(
        Math.abs(connection.start.y - connection.source.y),
        `${label}: source y`,
      ).toBeLessThan(1);
      expect(
        Math.abs(connection.end.x - connection.destination.x),
        `${label}: destination x`,
      ).toBeLessThan(1);
      expect(
        Math.abs(connection.end.y - connection.destination.y),
        `${label}: destination y`,
      ).toBeLessThan(1);
    }
  }
});
