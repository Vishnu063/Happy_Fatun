import { chromium, devices, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
// Called only by the isolated Compose runner; never exported with real credentials.
export async function testWebsiteBrowser(origin, password) {
  const browser = await chromium.launch(
    existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }
      : {},
  );
  mkdirSync("test-results/website", { recursive: true });
  try {
    for (const profile of ["desktop", "mobile"]) {
      const context = await browser.newContext({
        baseURL: origin,
        ...(profile === "mobile"
          ? devices["Pixel 7"]
          : { viewport: { width: 1440, height: 1000 } }),
      });
      try {
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto("/");
        await expect(page.locator("#collection .product-card")).toHaveCount(24);
        await expect(
          page.getByRole("heading", {
            name: "Furniture with soul. Made for your life.",
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `test-results/website/${profile}-storefront.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Phones", exact: true }).click();
        await expect(page.locator("#collection .product-card")).toHaveCount(10);
        await page
          .getByRole("searchbox", { name: "Search products" })
          .fill("Compact smartphone");
        await expect(page.locator("#collection .product-card")).toHaveCount(1);
        await page.locator("#collection .product-link").click();
        await expect(
          page.getByText("Confirm with the owner; demo listing only", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByLabel("Length (cm)", { exact: true }),
        ).toHaveCount(0);
        await page.screenshot({
          path: `test-results/website/${profile}-phone.png`,
          fullPage: true,
        });
        await page.goto("/collections/shoes/shoes");
        await expect(page.locator("#collection .product-card")).toHaveCount(10);
        await page
          .getByRole("searchbox", { name: "Search products" })
          .fill("Everyday sneakers");
        await page.locator("#collection .product-link").click();
        await page.getByText("Product options", { exact: true }).click();
        await page
          .getByRole("combobox", { name: "Variant / size", exact: true })
          .selectOption("Size 8");
        await page
          .getByLabel("Full name", { exact: true })
          .fill(`Merchandise ${profile} fixture`);
        await page.getByLabel("Phone", { exact: true }).fill("9000000027");
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", {
            name: "Request a personal quotation",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", { name: "A beautiful beginning." }),
        ).toBeVisible();
        const merchandiseReference = await page
          .locator(".reference strong")
          .innerText();
        await page.goto("/admin");
        await page.getByLabel("Owner password").fill(password);
        await page
          .getByRole("button", { name: "Enter owner studio", exact: true })
          .click();
        await page
          .getByRole("searchbox", { name: "Search inquiries" })
          .fill(merchandiseReference);
        const merchandiseInquiry = page
          .locator(".inquiry")
          .filter({ hasText: merchandiseReference });
        await merchandiseInquiry.locator("summary").click();
        await expect(merchandiseInquiry).toContainText("Size 8");
        await expect(merchandiseInquiry).toContainText(
          "Merchandise specifications to confirm",
        );
        await expect(merchandiseInquiry).not.toContainText("20 × 20 × 10 cm");
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await page.goto("/");
        await page
          .getByRole("button", { name: "Dining tables", exact: true })
          .click();
        await page
          .getByRole("searchbox", { name: "Search products" })
          .fill("Gather");
        await expect(page.locator("#collection .product-card")).toHaveCount(1);
        await page.locator("#collection .product-link").click();
        await page
          .getByText("Optional furniture customization", { exact: true })
          .click();
        await page.getByLabel("Length (cm)", { exact: true }).fill("225");
        await page
          .getByLabel("Full name", { exact: true })
          .fill(`Website ${profile} fixture`);
        await page.getByLabel("Phone", { exact: true }).fill("9000000028");
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", {
            name: "Request a personal quotation",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", { name: "A beautiful beginning." }),
        ).toBeVisible();
        const reference = await page.locator(".reference strong").innerText();
        expect(reference).toMatch(/^AL-/);
        await page.goto("/admin");
        await page.getByLabel("Owner password").fill(password);
        await page
          .getByRole("button", { name: "Enter owner studio", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Room to create." }),
        ).toBeVisible();
        await page
          .getByRole("searchbox", { name: "Search inquiries" })
          .fill(reference);
        const inquiry = page.locator(".inquiry").filter({ hasText: reference });
        await expect(inquiry).toHaveCount(1);
        await inquiry.locator("summary").click();
        await expect(inquiry).toContainText(`Website ${profile} fixture`);
        await expect(inquiry).toContainText("225 × 90 × 76 cm");
        await page.reload();
        await page
          .getByRole("searchbox", { name: "Search inquiries" })
          .fill(reference);
        await expect(
          page.locator(".inquiry").filter({ hasText: reference }),
        ).toHaveCount(1);
        await page.screenshot({
          path: `test-results/website/${profile}-master-control.png`,
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        expect((await page.request.get("/api/admin/data")).status()).toBe(401);
        expect(errors).toEqual([]);
        console.log(
          `PASS: ${profile} browser catalog/search/customization/quotation/PostgreSQL persistence/private dashboard/logout`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
