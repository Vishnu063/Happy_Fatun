import type { Env } from "./index";

/** Move unreferenced registry entries to durable cleanup before removing metadata. */
export async function queueRetiredMedia(env: Env, id?: string) {
  const condition = id
    ? "m.id=?"
    : "m.created_at < datetime('now','-5 minutes')";
  const query = env.DB
    .prepare(`INSERT OR IGNORE INTO media_cleanup_queue(storage_key)
    SELECT m.storage_key FROM media_objects m WHERE ${condition}
    AND NOT EXISTS (SELECT 1 FROM products p,json_each(p.images) j
      WHERE p.id=m.product_id AND j.value='/media/'||m.id)`);
  await env.DB.batch([
    id ? query.bind(id) : query,
    env.DB.prepare(`DELETE FROM media_objects WHERE storage_key IN
      (SELECT storage_key FROM media_cleanup_queue)`),
  ]);
}

/** Bounded, idempotent retries; a provider failure never drops the key. */
export async function flushMediaCleanup(env: Env) {
  if (!env.PRODUCT_IMAGES) return;
  const rows = await env.DB.prepare(
    "SELECT storage_key FROM media_cleanup_queue WHERE available_at<=CURRENT_TIMESTAMP ORDER BY created_at,storage_key LIMIT 50",
  ).all<{ storage_key: string }>();
  for (const row of rows.results) {
    await env.DB.prepare(
      "UPDATE media_cleanup_queue SET attempts=attempts+1,last_attempt_at=CURRENT_TIMESTAMP WHERE storage_key=?",
    )
      .bind(row.storage_key)
      .run();
    try {
      await env.PRODUCT_IMAGES.delete(row.storage_key);
      await env.DB.prepare(
        "DELETE FROM media_cleanup_queue WHERE storage_key=?",
      )
        .bind(row.storage_key)
        .run();
    } catch {
      console.error("Product image cleanup remains queued.");
    }
  }
}

export async function mediaCleanupStatus(env: Env) {
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM media_cleanup_queue",
  ).first<{ count: number }>();
  const stale = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM media_objects m
    WHERE m.created_at < datetime('now','-5 minutes') AND NOT EXISTS
    (SELECT 1 FROM products p,json_each(p.images) j WHERE p.id=m.product_id AND j.value='/media/'||m.id)`,
  ).first<{ count: number }>();
  return {
    pending: pending?.count ?? 0,
    stale: stale?.count ?? 0,
    configured: Boolean(env.PRODUCT_IMAGES),
  };
}
