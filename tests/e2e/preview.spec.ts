import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://127.0.0.1:8790";
test("no-R2 preview preserves quotes, owner security and safe catalog edits", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#collection .product-card")).toHaveCount(24);
  const html = await page.request.get("/design/aara-lounge-sofa/sofas-1");
  expect(html.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(await html.text()).toContain("<h1>Aara lounge sofa</h1>");
  expect(await (await page.request.get("/robots.txt")).text()).toBe(
    "User-agent: *\nDisallow: /\n",
  );
  await page.goto("/design/aara-lounge-sofa/sofas-1");
  await expect(page.locator(".gallery img").first()).toBeVisible();
  await page.getByLabel("Length (cm)", { exact: true }).fill("225");
  await page
    .getByRole("combobox", { name: "Material", exact: true })
    .selectOption("Walnut");
  await page
    .getByLabel("Your name", { exact: true })
    .fill(`Preview ${isMobile ? "Mobile" : "Desktop"}`);
  await page.getByLabel("Phone", { exact: true }).fill("+91 9000000000");
  await page.getByLabel("Email", { exact: true }).fill("preview@example.test");
  await page
    .getByLabel("Delivery area", { exact: true })
    .fill("Isolated preview fixture");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Request a personal quotation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A beautiful beginning.", exact: true }),
  ).toBeVisible();
  const reference = await page.locator(".reference strong").innerText();
  expect(reference).toMatch(/^AL-/);
  expect(
    (
      await page.request.delete("/api/admin/products/sofas-1/images/0", {
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(401);
  await page.goto("/admin");
  await page
    .getByLabel("Owner password")
    .fill("e2e-only-owner-password-not-for-production");
  await page
    .getByRole("button", { name: "Enter owner studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Room to create.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search inquiries" })
    .fill(reference);
  const inquiry = page.locator(".inquiry").filter({ hasText: reference });
  await inquiry.locator("summary").click();
  await expect(
    inquiry.getByText("225 × 90 × 82 cm", { exact: true }),
  ).toBeVisible();
  await expect(
    inquiry.getByText("Email: disabled", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "products", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Aara lounge sofa", exact: true })
    .click();
  const gallery = page.getByRole("region", {
    name: "Product image management",
  });
  await expect(gallery).toContainText("unavailable in preview");
  await expect(page.getByLabel("Image file", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete image 1", exact: true }),
  ).toBeDisabled();
  const before = await (
    await page.request.get("/api/products/sofas-1/images")
  ).json();
  expect(
    (
      await page.request.delete("/api/admin/products/sofas-1/images/0", {
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(503);
  const after = await (
    await page.request.get("/api/products/sofas-1/images")
  ).json();
  expect(after.images).toEqual(before.images);
  await page
    .getByRole("button", { name: "Move image 2 earlier", exact: true })
    .click();
  await expect(
    page.getByText("Gallery order saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Edit alt text for image 1", { exact: true })
    .fill("Preview static furniture illustration");
  await page
    .getByRole("button", { name: "Save image 1 description", exact: true })
    .click();
  await expect(
    page.getByText("Image description saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Starting price (₹, blank = on request)", { exact: true })
    .fill("25000");
  await page
    .getByLabel("SEO title", { exact: true })
    .fill("Preview owner listing");
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Design saved. Public catalog updated." }),
  ).toHaveText("Design saved. Public catalog updated.");
  await page.getByRole("button", { name: "settings", exact: true }).click();
  const cleanup = page.getByRole("region", { name: "Image storage cleanup" });
  await expect(cleanup).toContainText("unavailable in preview");
  await expect(
    cleanup.getByRole("button", { name: "Retry image cleanup", exact: true }),
  ).toBeDisabled();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const persisted = await (await page.request.get("/api/admin/data")).json();
  const stored = persisted.quotes.find(
    (q: { reference: string }) => q.reference === reference,
  );
  expect(stored.configuration.length).toBe(225);
  expect(stored.configuration.material).toBe("Walnut");
  expect(stored.email_status).toBe("disabled");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await page.request.get("/api/admin/data")).status()).toBe(401);
  await page.goto("/design/aara-lounge-sofa/sofas-1");
  await expect(page).toHaveTitle("Preview owner listing");
  await expect(
    page.getByText("Starting at ₹25,000", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gallery img").first()).toHaveAttribute(
    "alt",
    "Preview static furniture illustration",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
