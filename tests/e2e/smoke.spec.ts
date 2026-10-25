import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  await expect(page.locator("#collection .product-card")).toHaveCount(4);
  await page.getByRole("searchbox", { name: "Search furniture" }).fill("Aara");
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Material filter" })
    .selectOption("Walnut");
  await expect(page.locator("#collection .product-card")).toHaveCount(1);
  await page.locator("#collection .product-card a").click();
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
  await page
    .getByRole("button", { name: "Request a personal quotation" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A beautiful beginning." }),
  ).toBeVisible();
  const reference = await page.locator(".reference strong").innerText();
  expect(reference).toMatch(/^AL-/);
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
