import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("private supplier comparison, editing and archive survive without R2", async ({
  page,
}, info) => {
  const suffix = info.project.name;
  const alpha = `Isolated Alpha ${suffix}`,
    beta = `Isolated Beta ${suffix}`;
  await page.goto("/admin");
  await page
    .getByLabel("Owner password")
    .fill("e2e-only-owner-password-not-for-production");
  await page
    .getByRole("button", { name: "Enter owner studio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "shops & suppliers", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Private shop and supplier tracking",
    exact: true,
  });
  for (const name of [alpha, beta]) {
    await panel.getByLabel("Shop name", { exact: true }).fill(name);
    await panel.getByLabel("Shop locality").fill("Isolated fixture locality");
    await panel.getByLabel("Shop phone").fill("+91 9000000011");
    await panel.getByLabel("Shop notes").fill("Private sourcing test fixture");
    await panel.getByRole("button", { name: "Save shop", exact: true }).click();
    await expect(
      panel.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  for (const [name, cost] of [
    [alpha, "10000.25"],
    [beta, "8000"],
  ]) {
    await panel
      .getByRole("combobox", { name: "Supplier product", exact: true })
      .selectOption("pilot-dining");
    await panel.getByLabel("Linked shop").selectOption({ label: name });
    await panel
      .getByLabel("Supplier cost (₹, optional)", { exact: true })
      .fill(cost);
    await panel
      .getByLabel("Intended selling price (₹, private, optional)")
      .fill("12000");
    await panel
      .getByLabel("Supplier lead time (optional)")
      .fill("Owner confirmation needed");
    await panel
      .getByRole("button", { name: "Save supplier link", exact: true })
      .click();
    await expect(panel.getByRole("status")).toHaveText("Supplier link saved.");
    await expect(
      panel.getByRole("button", {
        name: `Edit terms for supplier link ${name} for Vana pedestal dining table`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await panel.getByLabel("Search suppliers", { exact: true }).fill(`Isolated`);
  await panel
    .getByLabel("Filter supplier product")
    .selectOption("pilot-dining");
  const table = panel.getByRole("table", {
    name: "Private supplier cost comparison",
  });
  await expect(
    table.locator("tbody tr").filter({ hasText: suffix }),
  ).toHaveCount(2);
  const betaRow = table.locator("tbody tr").filter({ hasText: beta });
  await expect(betaRow).toContainText("33.3%");
  await expect(
    table.locator("tbody tr").filter({ hasText: alpha }),
  ).toContainText("₹10,000.25");
  await expect(
    table.locator("tbody tr").filter({ hasText: suffix }).first(),
  ).toContainText(beta);
  await panel
    .getByLabel("Filter supplier location")
    .selectOption("Isolated fixture locality");
  await panel
    .getByLabel("Filter supplier availability")
    .selectOption("available");
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await panel
    .getByLabel("Filter supplier availability")
    .selectOption("unknown");
  await panel.getByLabel("Filter supplier shop").selectOption({ label: beta });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await panel.getByLabel("Filter supplier shop").selectOption("");
  await panel.getByLabel("Search suppliers", { exact: true }).fill(beta);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await betaRow
    .getByRole("button", { name: /^Edit terms for supplier link/ })
    .click();
  await panel
    .getByLabel("Supplier cost (₹, optional)", { exact: true })
    .fill("");
  await panel
    .getByLabel("Intended selling price (₹, private, optional)")
    .fill("");
  await panel
    .getByRole("button", { name: "Save supplier link", exact: true })
    .click();
  await expect(betaRow).toContainText("Not calculated");
  await expect(betaRow.getByText("Not recorded", { exact: true })).toHaveCount(
    2,
  );
  await betaRow
    .getByRole("button", { name: /^Archive link for supplier/ })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await panel.getByLabel("Supplier record visibility").selectOption("archived");
  await expect(betaRow).toContainText("Archived");
  await betaRow
    .getByRole("button", { name: /^Restore link for supplier/ })
    .click();
  await panel.getByLabel("Supplier record visibility").selectOption("active");
  await expect(betaRow).toContainText("Not calculated");
  await panel
    .getByRole("button", { name: `Edit shop ${beta}`, exact: true })
    .click();
  await panel.getByLabel("Shop address").fill("Private address fixture only");
  await panel.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(betaRow).toContainText("Private address fixture only");
  await panel
    .getByRole("button", { name: `Archive shop ${beta}`, exact: true })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await panel.getByLabel("Supplier record visibility").selectOption("archived");
  await panel
    .getByRole("button", { name: `Restore shop ${beta}`, exact: true })
    .click();
  await panel.getByLabel("Supplier record visibility").selectOption("active");
  await panel.getByLabel("Search suppliers", { exact: true }).fill(suffix);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir("/tmp/aaranya-pilot-visuals", { recursive: true });
  await page.screenshot({
    path: `/tmp/aaranya-pilot-visuals/${suffix}-private-suppliers.png`,
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "shops & suppliers", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: beta, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "products", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Suppliers for Vana pedestal dining table",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Product shop and supplier tracking",
        exact: true,
      })
      .getByLabel("Filter supplier product"),
  ).toHaveValue("pilot-dining");
  await page.getByRole("button", { name: "products", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Edit Vana pedestal dining table",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Product shop and supplier tracking",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("form form")).toHaveCount(0);
  const publicData = await (await page.request.get("/api/catalog")).text();
  for (const privateValue of [
    alpha,
    beta,
    "Private address fixture only",
    "+91 9000000011",
    "supplier_cost",
    "selling_price",
  ])
    expect(publicData).not.toContain(privateValue);
  const product = await (
    await page.request.get("/api/products/pilot-dining")
  ).json();
  expect(product.product.price).toBeNull();
  await page.getByRole("button", { name: /log out|sign out/i }).click();
  expect((await page.request.get("/api/admin/suppliers")).status()).toBe(401);
});
