import { it, expect } from "vitest";
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import { S3Media } from "../../server/storage";
const endpoint = process.env.TEST_S3_ENDPOINT;
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint))
  throw new Error(
    "An isolated loopback S3 emulator is required; no AWS target permitted",
  );
it("uses real signed SDK HTTP requests for put/get/missing/delete through a local S3 emulator", async () => {
  const client = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: "isolated-emulator-only",
        secretAccessKey: "isolated-emulator-only",
      },
    }),
    bucket = "happy-fixture-" + crypto.randomUUID();
  const store = new S3Media(client, bucket);
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  try {
    const body = await readFile("public/assets/pilot/dining-card.webp"),
      key = "products/pilot/fixture.webp";
    expect(await store.get(key)).toBeNull();
    await store.put(key, body, { httpMetadata: { contentType: "image/webp" } });
    const loaded = await store.get(key);
    expect(Buffer.from(loaded!.body)).toEqual(body);
    expect(loaded!.httpEtag).toMatch(/^".+"$/);
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  } finally {
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
  }
});
