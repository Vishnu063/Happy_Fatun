import { it, expect, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage } from "node:http";
import { FileMedia, S3Media, safeKey, mediaStore } from "../server/storage";
import { staticAssets } from "../server/assets";
import {
  clientIP,
  trustedProxy,
  publicOrigin,
  validateProductionConfig,
} from "../server/proxy";
import { postgresSQL, splitSQL } from "../server/db/sql";
import { S3Client } from "@aws-sdk/client-s3";
it("keeps bind markers distinct from quoted values/comments and preserves complete SQL statements", () => {
  expect(postgresSQL("SELECT '?' AS literal,? AS bound -- ?\n")).toContain(
    "'?' AS literal,$1 AS bound -- ?",
  );
  expect(splitSQL("SELECT 'semi;colon'; SELECT 'it''s';")).toHaveLength(2);
  expect(() => splitSQL("SELECT 'unfinished")).toThrow();
  expect(() => postgresSQL("PRAGMA foreign_keys=ON")).toThrow();
  expect(
    postgresSQL("SELECT 'x IS NOT ?' AS literal WHERE price IS NOT ?"),
  ).toBe("SELECT 'x IS NOT ?' AS literal WHERE price IS DISTINCT FROM $1");
  expect(postgresSQL("INSERT OR IGNORE INTO x(id) VALUES(?)")).toBe(
    "INSERT INTO x(id) VALUES($1) ON CONFLICT DO NOTHING",
  );
});
it("trusts only explicit proxy hops, ignores spoofed forwarding on direct clients, and fixes the public origin", () => {
  const req = {
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.3" },
  } as unknown as IncomingMessage;
  expect(clientIP(req, trustedProxy(""))).toBe("192.0.2.10");
  const proxied = {
    ...req,
    socket: { remoteAddress: "10.0.0.2" },
  } as unknown as IncomingMessage;
  expect(clientIP(proxied, trustedProxy("10.0.0.0/24"))).toBe("198.51.100.4");
  expect(() => trustedProxy("0.0.0.0/0")).toThrow();
  expect(() => publicOrigin("http://shop.test", true)).toThrow();
  expect(() => publicOrigin("https://user:password@shop.test", true)).toThrow();
  expect(publicOrigin("https://shop.test", true)).toBe("https://shop.test");
});
it("uses bounded persistent files, atomic replacement and rejects traversal/symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "furn-files-")),
    outside = await mkdtemp(join(tmpdir(), "furn-outside-"));
  try {
    const store = new FileMedia(dir);
    for (const key of ["../secret", "/absolute", "a/../../x", "a//b"])
      expect(() => safeKey(key)).toThrow();
    await store.put("products/a/test.webp", Buffer.from("first"));
    expect(
      Buffer.from((await store.get("products/a/test.webp"))!.body).toString(),
    ).toBe("first");
    await store.put("products/a/test.webp", Buffer.from("replacement"));
    expect(
      Buffer.from(
        (await new FileMedia(dir).get("products/a/test.webp"))!.body,
      ).toString(),
    ).toBe("replacement");
    await symlink(outside, join(dir, "escape"));
    await expect(
      store.put("escape/new/file", Buffer.from("no")),
    ).rejects.toThrow(/symlink/);
    await writeFile(join(outside, "private"), "private");
    await symlink(join(outside, "private"), join(dir, "link"));
    await expect(store.get("link")).rejects.toThrow();
    await expect(
      store.put("huge", new Uint8Array(5 * 1024 * 1024 + 1)),
    ).rejects.toThrow();
    await store.delete("products/a/test.webp");
    expect(await store.get("products/a/test.webp")).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
it("serves only intended static files and preserves HTML shell for server SEO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "furn-assets-"));
  try {
    await writeFile(join(dir, "index.html"), "<html>shell</html>");
    await symlink("/etc/passwd", join(dir, "escaped.js"));
    const assets = staticAssets(dir);
    expect(await (await assets.fetch("http://localhost/")).text()).toContain(
      "shell",
    );
    expect((await assets.fetch("http://localhost/escaped.js")).status).toBe(
      404,
    );
    expect((await assets.fetch("http://localhost/missing.js")).status).toBe(
      404,
    );
    expect(
      (await assets.fetch(new Request("http://localhost/", { method: "HEAD" })))
        .body,
    ).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("requires explicit private storage configuration and propagates S3 provider failures without public ACLs", async () => {
  expect(() =>
    mediaStore({
      MEDIA_DRIVER: "s3",
      S3_BUCKET: "fixture",
      AWS_REGION: "us-east-1",
      S3_ENDPOINT: "http://public.test",
      ENVIRONMENT: "production",
    }),
  ).toThrow(/TLS/);
  const send = vi.fn();
  const client = { send, destroy: vi.fn() } as unknown as S3Client;
  const store = new S3Media(client, "private-fixture");
  send.mockRejectedValueOnce(
    Object.assign(new Error("absent"), { name: "NoSuchKey" }),
  );
  expect(await store.get("products/a/b")).toBeNull();
  send.mockRejectedValueOnce(new Error("denied"));
  await expect(
    store.put("products/a/b", Buffer.from("file"), {
      httpMetadata: { contentType: "image/webp" },
    }),
  ).rejects.toThrow(/denied/);
  expect(send.mock.calls[1][0].input.ACL).toBeUndefined();
  expect(send.mock.calls[1][0].input.Bucket).toBe("private-fixture");
});

it("fails closed on production authentication/TLS misconfiguration and unsafe DSN overrides", async () => {
  const { databasePool } = await import("../server/db/postgres");
  expect(() =>
    validateProductionConfig({
      ENVIRONMENT: "production",
      DATABASE_SSL: "false",
    }),
  ).toThrow();
  expect(() =>
    validateProductionConfig({
      ENVIRONMENT: "production",
      DATABASE_SSL: "true",
      SESSION_SECRET: "a".repeat(32),
      OWNER_PASSWORD_HASH: "a".repeat(32) + ":" + "b".repeat(64),
    }),
  ).not.toThrow();
  expect(() =>
    databasePool("postgresql://fixture@127.0.0.1/fixture?sslmode=no-verify"),
  ).toThrow(/overrides/);
});

it("redacts malformed connection/origin configuration instead of logging secret-bearing URL input", async () => {
  const { parseDatabaseURL } = await import("../server/db/postgres");
  try {
    parseDatabaseURL("postgres://fixture:private-value@");
    throw new Error("Expected rejection");
  } catch (error) {
    expect(String(error)).not.toContain("private-value");
    expect(String(error)).toContain("redacted");
  }
  expect(() => publicOrigin("ftp://localhost", false)).toThrow();
  expect(() => trustedProxy("0.0.0.0/00")).toThrow();
});
