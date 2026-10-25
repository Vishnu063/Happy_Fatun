import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { modelFrame } from "./model-frame";
const ownerPassword = "e2e-only-owner-password-not-for-production";
test("catalog, gallery, configuration, persisted quote and private owner flow", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Furniture with soul. Made for your life.",
    }),
  ).toBeVisible();
  await expect(page.locator("#collection .product-card")).toHaveCount(24);
  await expect(
    page.getByRole("link", { name: "Aaranya Living home", exact: true }),
  ).toBeVisible();
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    return {
      responseStartMs: navigation.responseStart,
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      loadMs: navigation.loadEventEnd,
      firstContentfulPaintMs:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
        null,
    };
  });
  await test.info().attach("local-navigation-performance", {
    body: JSON.stringify(timing),
    contentType: "application/json",
  });
  await page.screenshot({
    path: `test-results/${isMobile ? "mobile" : "desktop"}-home.png`,
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sofas", exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/sofas\/sofas$/);
  await expect(page.locator("#collection .product-card")).toHaveCount(4);
  await page.getByRole("searchbox", { name: "Search furniture" }).fill("Aara");
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Material filter" })
    .selectOption("Walnut");
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await page.locator("#collection .product-card .product-link").click();
  await expect(
    page.getByRole("heading", { name: "Aara lounge sofa", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/design\/aara-lounge-sofa\/sofas-1$/);
  await expect(page).toHaveTitle(
    "Aara lounge sofa | Furniture design | Aaranya Living",
  );
  const serverDocument = await page.request.get(
    "/design/aara-lounge-sofa/sofas-1",
  );
  expect(serverDocument.status()).toBe(200);
  expect(await serverDocument.text()).toContain("<h1>Aara lounge sofa</h1>");
  const zoomButton = page.getByRole("button", {
    name: "Zoom image",
    exact: true,
  });
  await zoomButton.click();
  const zoomDialog = page.getByRole("dialog", {
    name: "Aara lounge sofa",
    exact: true,
  });
  await expect(zoomDialog).toBeVisible();
  const zoomAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(zoomAccessibility.violations).toEqual([]);
  await zoomDialog
    .getByRole("button", { name: "Zoom image in", exact: true })
    .click();
  await expect(zoomDialog.getByLabel("Image magnification")).toHaveText("150%");
  await zoomDialog
    .getByRole("button", { name: "Reset zoom", exact: true })
    .click();
  await expect(zoomDialog.getByLabel("Image magnification")).toHaveText("100%");
  await page.keyboard.press("Escape");
  await expect(zoomDialog).not.toBeVisible();
  await expect(zoomButton).toBeFocused();
  await page.getByRole("button", { name: "Next image", exact: true }).click();
  await expect(page.locator(".gallery-count")).toHaveText("2 / 3");
  await page.locator(".gallery").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".gallery-count")).toHaveText("3 / 3");
  if (isMobile) {
    await page.locator(".gallery").evaluate((el) => {
      const start = new Touch({
        identifier: 1,
        target: el,
        clientX: 280,
        clientY: 150,
      });
      const end = new Touch({
        identifier: 1,
        target: el,
        clientX: 80,
        clientY: 150,
      });
      el.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [start] }),
      );
      el.dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, changedTouches: [end] }),
      );
    });
    await expect(page.locator(".gallery-count")).toHaveText("1 / 3");
  }
  await page.getByRole("button", { name: "360°", exact: true }).click();
  await expect(
    page
      .locator(".viewer canvas")
      .or(page.getByText("3D is unavailable on this device.")),
  ).toBeVisible();
  await page.getByRole("button", { name: "View image 1", exact: true }).click();
  await page.getByLabel("Length (cm)", { exact: true }).fill("225");
  await page
    .getByRole("combobox", { name: "Material", exact: true })
    .selectOption("Walnut");
  await page
    .getByRole("combobox", { name: "Color", exact: true })
    .selectOption("Olive");
  await page
    .getByLabel("Special notes", { exact: false })
    .fill(`Smoke test ${isMobile ? "mobile" : "desktop"}`);
  await page
    .getByLabel("Your name", { exact: true })
    .fill(`Smoke ${isMobile ? "Mobile" : "Desktop"}`);
  await page.getByLabel("Phone", { exact: true }).fill("+91 9000000000");
  await page.getByLabel("Email", { exact: true }).fill("smoke@example.test");
  await page.getByLabel("Delivery area", { exact: true }).fill("Test locality");
  await page.getByRole("checkbox").check();
  let persistedReference = "";
  const submissionKeys: string[] = [];
  await page.route("**/api/quotes", async (route) => {
    submissionKeys.push(route.request().postDataJSON().submission_key);
    const response = await route.fetch();
    if (!persistedReference) {
      persistedReference = (await response.json()).reference;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Request a personal quotation" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "We couldn't confirm the response.",
  );
  await page
    .getByRole("button", { name: "Request a personal quotation" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A beautiful beginning." }),
  ).toBeVisible();
  const reference = await page.locator(".reference strong").innerText();
  expect(reference).toMatch(/^AL-/);
  expect(reference).toBe(persistedReference);
  expect(submissionKeys).toHaveLength(2);
  expect(submissionKeys[0]).toBeTruthy();
  expect(submissionKeys[0]).toBe(submissionKeys[1]);
  const anonymous = await page.request.put("/api/admin/products/sofas-1", {
    headers: { Origin: "http://127.0.0.1:8790" },
    data: { price: 1 },
  });
  expect(anonymous.status()).toBe(401);
  await page.goto("/#/admin");
  await page.getByLabel("Owner password").fill(ownerPassword);
  await page.getByRole("button", { name: "Enter owner studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Room to create." }),
  ).toBeVisible();
  const ownerAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(ownerAccessibility.violations).toEqual([]);
  await page
    .getByRole("searchbox", { name: "Search inquiries" })
    .fill(reference);
  const inquiry = page.locator(".inquiry").filter({ hasText: reference });
  await inquiry.locator("summary").click();
  await expect(inquiry.getByText("225 × 90 × 82 cm")).toBeVisible();
  await expect(inquiry.getByText("Walnut / Olive")).toBeVisible();
  await expect(
    inquiry.getByText("Email: local", { exact: true }),
  ).toBeVisible();
  await inquiry
    .getByRole("combobox", { name: "Inquiry status", exact: true })
    .selectOption("Reviewing");
  await inquiry.getByLabel("Internal cost (₹)", { exact: true }).fill("9000");
  await inquiry.getByLabel("Final quote (₹)", { exact: true }).fill("10000");
  await expect(inquiry.getByText(/Below the 20% minimum/)).toBeVisible();
  await inquiry.getByRole("button", { name: "Save inquiry" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This quote is below the minimum margin." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "leads", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search leads" }).fill(reference);
  const lead = page.locator(".lead").filter({ hasText: reference });
  await lead.locator("summary").click();
  await lead
    .getByRole("combobox", { name: "Lead stage", exact: true })
    .selectOption("Quote Sent");
  await lead
    .getByRole("textbox", { name: "Private follow-up notes", exact: true })
    .fill("Discuss preferred wood finish.");
  await lead.getByLabel("Follow-up date", { exact: true }).fill("2030-02-20");
  await lead
    .getByRole("button", { name: "Save lead follow-up", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Lead follow-up saved." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Lead stage filter", exact: true })
    .selectOption("Quote Sent");
  await expect(page.locator(".lead")).toHaveCount(1);
  await page.locator(".lead summary").click();
  await expect(
    page.getByRole("textbox", { name: "Private follow-up notes", exact: true }),
  ).toHaveValue("Discuss preferred wood finish.");
  await expect(page.getByLabel("Follow-up date", { exact: true })).toHaveValue(
    "2030-02-20",
  );
  await lead
    .getByRole("combobox", { name: "Lead stage", exact: true })
    .selectOption("Won");
  await lead
    .getByRole("button", { name: "Save lead follow-up", exact: true })
    .click();
  await expect(page.locator(".lead")).toHaveCount(0); // Existing Quote Sent filter remains active.
  const inquiryCount = (
    await (await page.request.get("/api/admin/data")).json()
  ).quotes.length;
  await expect(
    page
      .locator(".lead-totals > div")
      .filter({ has: page.getByText("Won", { exact: true }) })
      .locator("strong"),
  ).toHaveText(String(inquiryCount));
  await expect(
    page.getByText(
      `${inquiryCount} recorded inquiries · 100.0% marked won. This is an inquiry conversion ratio, not a guarantee of sales.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".source-totals")).toHaveText(
    `direct: ${inquiryCount}`,
  );
  await page.getByRole("button", { name: "products", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Aara lounge sofa", exact: true })
    .click();
  await page
    .getByLabel("Starting price (₹, blank = on request)", { exact: true })
    .fill("25000");
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Design saved. Public catalog updated.",
  );
  await page
    .getByRole("button", { name: "price history", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "₹25,000", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "settings", exact: true }).click();
  const cleanup = page.getByRole("region", { name: "Image storage cleanup" });
  await expect(cleanup).toContainText("0 queued objects");
  await cleanup
    .getByRole("button", { name: "Retry image cleanup", exact: true })
    .click();
  await expect(cleanup).toContainText("0 queued objects");
  await page.getByLabel("Public phone", { exact: true }).fill("+91 9000000001");
  await page
    .getByLabel("Public email", { exact: true })
    .fill("studio@example.test");
  await page
    .getByLabel("WhatsApp Business number (country code)", { exact: true })
    .fill("+919000000001");
  await page
    .getByRole("button", { name: "Save public contact details", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Public contact details saved." }),
  ).toBeVisible();
  const copiedCookie = (
    await page.context().cookies("http://127.0.0.1:8790/api/")
  ).find((c) => c.name === "hf_session")!;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const revoked = await page.request.get("/api/admin/data", {
    headers: { Cookie: `hf_session=${copiedCookie.value}` },
  });
  expect(revoked.status()).toBe(401);
  await expect(page.getByLabel("Owner password")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto("/#/product/sofas-1");
  await expect(
    page.getByText("Starting at ₹25,000", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Your space. A personal conversation." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "studio@example.test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Chat on WhatsApp", exact: true }),
  ).toHaveAttribute("href", /^https:\/\/wa.me\/919000000001\?text=/);
  await page.goto("/design/mysa-curved-sofa/sofas-2");
  await expect(
    page.getByRole("combobox", { name: "Material", exact: true }),
  ).toHaveValue("Walnut");
  await page.goto("/design/aara-lounge-sofa/sofas-1");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/${isMobile ? "mobile" : "desktop"}-product.png`,
    fullPage: true,
  });
});

test("owner creates, renames and deletes categories and designs", async ({
  page,
  isMobile,
}) => {
  await page.goto("/#/admin");
  await page.getByLabel("Owner password").fill(ownerPassword);
  await page.getByRole("button", { name: "Enter owner studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Room to create." }),
  ).toBeVisible();
  const suffix = isMobile ? "Mobile" : "Desktop";
  await page.getByRole("button", { name: "categories", exact: true }).click();
  await page.getByLabel("New category name").fill(`Test ${suffix}`);
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const categoryRow = page.locator(".category-row").filter({
    has: page.getByRole("textbox", {
      name: `Rename Test ${suffix}`,
      exact: true,
    }),
  });
  await categoryRow.getByRole("textbox").fill(`Studio ${suffix}`);
  await categoryRow
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: `Rename Studio ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "products", exact: true }).click();
  await page.getByRole("button", { name: "Add design", exact: true }).click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill(`Test desk ${suffix}`);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: `Studio ${suffix}` });
  await page
    .getByLabel("Description", { exact: true })
    .fill("An original end-to-end test design, not inventory.");
  await page
    .getByLabel("Starting price (₹, blank = on request)", { exact: true })
    .fill("10000");
  await page
    .getByLabel("SEO title", { exact: true })
    .fill(`Test desk search listing ${suffix}`);
  await page
    .getByLabel("Meta description", { exact: true })
    .fill(
      "A verified isolated search listing fixture, never real furniture stock.",
    );
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Edit Test desk ${suffix}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit Test desk ${suffix}`, exact: true })
    .click();
  const encoded = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ab8965";
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png").split(",")[1];
  });
  const fixture = {
    name: "studio.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  };
  await page.getByLabel("Image file", { exact: true }).setInputFiles(fixture);
  await page
    .getByLabel("Image description (alt text)", { exact: true })
    .fill("Studio test design on white background");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(
    page.getByText(
      "Image optimized and saved. Product and inquiry records preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".managed-image")).toHaveCount(2);
  await page
    .getByLabel("Edit alt text for image 2", { exact: true })
    .fill("Edited studio alt text for isolated test design");
  await page
    .getByRole("button", { name: "Save image 2 description", exact: true })
    .click();
  await expect(
    page.getByText("Image description saved.", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Upload destination", exact: true })
    .selectOption("0");
  await page.getByLabel("Image file", { exact: true }).setInputFiles(fixture);
  await page
    .getByLabel("Image description (alt text)", { exact: true })
    .fill("Matching test design in a room");
  await page
    .getByRole("button", { name: "Replace image", exact: true })
    .click();
  await expect(
    page.getByText(
      "Image optimized and saved. Product and inquiry records preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move image 2 earlier", exact: true })
    .click();
  await expect(
    page.getByText("Gallery order saved.", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete image 2", exact: true })
    .click();
  await expect(page.locator(".managed-image")).toHaveCount(1);
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  const catalog = await page.context().newPage();
  await catalog.goto("/");
  await catalog
    .getByRole("combobox", { name: "Sort designs" })
    .selectOption("low");
  await expect(
    catalog.locator("#collection .product-card").first(),
  ).toContainText(`Test desk ${suffix}`);
  await catalog
    .getByRole("combobox", { name: "Sort designs" })
    .selectOption("high");
  await expect(
    catalog.locator("#collection .product-card").first(),
  ).toContainText("Aara lounge sofa");
  await catalog.getByLabel("Maximum starting price in rupees").fill("20000");
  await expect(catalog.locator("#collection .product-card")).toHaveCount(1);
  await expect(catalog.locator("#collection .product-card")).toContainText(
    `Test desk ${suffix}`,
  );
  await catalog
    .locator("#collection")
    .getByRole("link", { name: "Request quote", exact: true })
    .click();
  await expect(catalog).toHaveURL(/#customize$/);
  await expect(catalog).toHaveTitle(`Test desk search listing ${suffix}`);
  await expect(catalog.locator(".gallery img").first()).toHaveAttribute(
    "alt",
    "Edited studio alt text for isolated test design",
  );

  await expect(
    catalog.getByLabel("Length (cm)", { exact: true }),
  ).toBeFocused();
  await catalog.close();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Delete Test desk ${suffix}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Edit Test desk ${suffix}`, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "categories", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Delete category Studio ${suffix}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: `Rename Studio ${suffix}`, exact: true }),
  ).toHaveCount(0);
});

test("catalog growth keeps initial rendering bounded and all designs discoverable", async ({
  page,
  isMobile,
}) => {
  const data = await (await page.request.get("/api/catalog")).json();
  const base = data.products[0];
  data.products = Array.from({ length: 300 }, (_, i) => ({
    ...base,
    id: `isolated-growth-${i}`,
    name: `Isolated growth fixture ${String(i).padStart(3, "0")}`,
    description: "Isolated browser load fixture; never published or stored.",
    model: null,
  }));
  await page.route("**/api/catalog", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await expect(page.locator("#collection .product-card")).toHaveCount(24);
  await page
    .getByRole("button", { name: "Load more designs", exact: true })
    .click();
  await expect(page.locator("#collection .product-card")).toHaveCount(48);
  await expect(
    page.locator("#collection .product-card").nth(24).locator(".product-link"),
  ).toBeFocused();
  await page
    .getByRole("searchbox", { name: "Search furniture", exact: true })
    .fill("fixture 299");
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await expect(page.locator("#collection .product-card")).toContainText(
    "Isolated growth fixture 299",
  );
  await page
    .getByRole("searchbox", {
      name: "Search all furniture designs",
      exact: true,
    })
    .fill("fixture 298");
  await page
    .getByRole("button", { name: "Search the collection", exact: true })
    .click();
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await expect(page.locator("#collection .product-card")).toContainText(
    "Isolated growth fixture 298",
  );
  await page.unrouteAll({ behavior: "wait" });
  if (isMobile)
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .getByRole("link", { name: "Buying guides", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/guides$/);
  await page
    .getByRole("link", {
      name: "Measure your room before requesting furniture",
      exact: true,
    })
    .click();
  await expect(page).toHaveTitle(
    "Measure your room before requesting furniture | Aaranya Living",
  );
  await expect(
    page.getByRole("heading", {
      name: "Check the delivery route",
      exact: true,
    }),
  ).toBeVisible();
});

for (const family of [
  "beds",
  "chairs",
  "desks",
  "dining",
  "sofas",
  "wardrobes",
]) {
  test(`per-product 3D inventory: ${family}`, async ({ page, isMobile }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(10000);
    const { products } = await (await page.request.get("/api/catalog")).json();
    expect(products).toHaveLength(24);
    const inventory: { id: string; shape: string | null; result: string }[] =
      [];
    const familyProducts = products.filter(
      (p: { category_id: string }) => p.category_id === family,
    );
    expect(familyProducts).toHaveLength(4);
    for (const product of familyProducts) {
      await page.goto(`/design/${product.id}`);
      if (!product.model) {
        await expect(
          page.getByRole("button", { name: "360°", exact: true }),
        ).toHaveCount(0);
        inventory.push({ id: product.id, shape: null, result: "gallery-only" });
        continue;
      }
      await page.getByRole("button", { name: "360°", exact: true }).click();
      const canvas = page.locator(".viewer canvas");
      await expect(
        canvas.or(page.getByText("3D is unavailable on this device.")),
      ).toBeVisible();
      if (!(await canvas.isVisible())) {
        inventory.push({
          id: product.id,
          shape: product.model,
          result: "device-fallback; controls not verified",
        });
        continue;
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await canvas.scrollIntoViewIfNeeded();
      await expect
        .poll(async () => (await modelFrame(canvas)).colors)
        .toBeGreaterThan(2);
      const initial = (await modelFrame(canvas)).hash;
      for (const name of [
        "Rotate model left",
        "Rotate model right",
        "Rotate model up",
        "Rotate model down",
        "Zoom model in",
        "Zoom model out",
      ]) {
        await page.getByRole("button", { name, exact: true }).click();
        await expect
          .poll(async () => (await modelFrame(canvas)).hash)
          .not.toBe(initial);
        expect(
          await page.evaluate(() => window.visualViewport?.scale ?? 1),
        ).toBe(1);
        await page
          .getByRole("button", { name: "Reset model view", exact: true })
          .click();
        await expect
          .poll(async () => (await modelFrame(canvas)).hash)
          .toBe(initial);
      }
      if (isMobile) {
        const box = (await canvas.boundingBox())!;
        const client = await page.context().newCDPSession(page);
        await client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          ],
        });
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: box.x + box.width / 2 - 60, y: box.y + box.height / 2 - 40 },
          ],
        });
        await client.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(async () => (await modelFrame(canvas)).hash)
          .not.toBe(initial);
        await client.detach();
      }
      inventory.push({
        id: product.id,
        shape: product.model,
        result: isMobile
          ? "generic controls and touch verified"
          : "generic controls verified",
      });
    }
    await test.info().attach("per-product-demo-3d-inventory", {
      body: JSON.stringify(inventory, null, 2),
      contentType: "application/json",
    });
    console.log(
      `${isMobile ? "Mobile" : "Desktop"} ${family} 3D inventory: ${inventory.filter((i) => i.result.startsWith("generic")).length} generic demos verified, ${inventory.filter((i) => i.result.startsWith("device")).length} device fallbacks, ${inventory.filter((i) => i.result === "gallery-only").length} gallery-only; zero accurate product models`,
    );
    if (family !== "sofas") return;
    // Deliberately remove WebGL once per profile, rather than relying on a machine that lacks it.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        if (type.includes("webgl")) return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    });
    await page.goto("/design/aara-lounge-sofa/sofas-1");
    await page.getByRole("button", { name: "360°", exact: true }).click();
    await expect(
      page.getByText("3D is unavailable on this device."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View image 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Zoom image", exact: true }),
    ).toBeVisible();
  });
}
