import { useEffect, useState } from "react";
import { api, send } from "../lib/api";
type Status = { pending: number; stale: number; configured: boolean };
export default function StorageCleanup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<Status>("/admin/media/cleanup")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section aria-label="Image storage cleanup">
      <h3>Image storage cleanup</h3>
      {status && (
        <p>
          {status.pending} queued objects · {status.stale} interrupted uploads
          ready for cleanup.{" "}
          {status.configured
            ? "Image storage configured."
            : "Image storage is not configured."}
        </p>
      )}
      <p>
        Failed deletions stay queued. Retry processes up to 50 objects.
        Interrupted uploads have a five minute grace period; retry after it
        expires.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="btn secondary"
        disabled={busy || !status?.configured}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setStatus(
              await api<Status>("/admin/media/cleanup", send("POST", {})),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Retrying…" : "Retry image cleanup"}
      </button>
    </section>
  );
}
