import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { Database } from "./helpers";
import app, { type Env } from "../worker/index";
import { imageType } from "../worker/media";
import { featuredProducts, priorityCategories } from "../shared/catalog";
describe("five-category original concept pilot", () => {
  it("serves five original single-view concepts with bounded optimized assets and no made-up inventory/price", async () => {
    const db = new Database();
    try {
      const env: Env = {
        DB: db as unknown as D1Database,
        ENVIRONMENT: "production",
      };
      const r = await app.request(
        "https://aaranya.example.test/api/catalog",
        {},
        env,
      );
      const data = await r.json<any>();
      expect(data.categories.map((c: { id: string }) => c.id)).toEqual([
        ...priorityCategories,
      ]);
      for (const id of featuredProducts) {
        const p = data.products.find((p: { id: string }) => p.id === id);
        expect(p).toBeDefined();
        expect(p.status).toBe("concept");
        expect(p.price).toBeNull();
        expect(p.model).toBeNull();
        expect(p.description).toContain(
          "not verified manufacturing specifications",
        );
        expect(p.images).toHaveLength(1);
        const file = "public" + p.images[0];
        expect(imageType(new Uint8Array(readFileSync(file)))).toBe(
          "image/webp",
        );
        expect(statSync(file).size).toBeLessThan(100000);
        expect(
          statSync(file.replace("-studio.webp", "-card.webp")).size,
        ).toBeLessThan(20000);
      }
      expect(db.db.prepare("SELECT COUNT(*) n FROM products").get()?.n).toBe(
        29,
      );
    } finally {
      db.db.close();
    }
  });
  it("keeps legacy product/category URLs available without adding them to initial discovery", async () => {
    const db = new Database();
    try {
      const env: Env = {
        DB: db as unknown as D1Database,
        ENVIRONMENT: "production",
      };
      const detail = await app.request(
        "https://aaranya.example.test/api/products/sofas-1",
        {},
        env,
      );
      expect(detail.status).toBe(200);
      expect((await detail.json<any>()).product.model).toBeNull();
      expect(
        db.db.prepare("SELECT model FROM products WHERE id='sofas-1'").get()
          ?.model,
      ).toBe("sofas");
      const category = await app.request(
        "https://aaranya.example.test/api/catalog?category_id=sofas",
        {},
        env,
      );
      expect((await category.json<any>()).products).toHaveLength(4);
      db.db
        .prepare("UPDATE products SET status='archived' WHERE id='sofas-1'")
        .run();
      expect(
        (
          await app.request(
            "https://aaranya.example.test/api/products/sofas-1",
            {},
            env,
          )
        ).status,
      ).toBe(404);
    } finally {
      db.db.close();
    }
  });
});
