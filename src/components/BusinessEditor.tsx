import { useEffect, useState } from "react";
import { api, send } from "../lib/api";
import type { Business } from "../lib/contact";
export default function BusinessEditor({
  onSaved,
}: {
  onSaved: () => unknown;
}) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api<Business>("/admin/business")
      .then(setBusiness)
      .catch((e) => setError(e.message));
  }, []);
  if (!business)
    return <p role="status">{error || "Loading business profile…"}</p>;
  return (
    <section className="business-editor">
      <h2>Public business details</h2>
      <p className="muted small">
        Publish only accurate details. No address, service radius or contact
        number is assumed. These fields are public; do not enter secrets or
        private owner notification addresses unless intended for customers.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            await api("/admin/business", send("PUT", business));
            setNotice("Public contact details saved.");
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="two-fields">
          {(
            ["phone", "email", "whatsapp", "service_area", "address"] as const
          ).map((key) => (
            <label key={key}>
              {
                {
                  phone: "Public phone",
                  email: "Public email",
                  whatsapp: "WhatsApp Business number (country code)",
                  service_area: "Confirmed service areas",
                  address: "Public business address",
                }[key]
              }
              <input
                type={key === "email" ? "email" : "text"}
                maxLength={key === "phone" ? 25 : key === "whatsapp" ? 16 : 500}
                value={business[key] || ""}
                onChange={(e) =>
                  setBusiness({ ...business, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Business introduction
          <textarea
            rows={3}
            maxLength={1200}
            value={business.summary || ""}
            onChange={(e) =>
              setBusiness({ ...business, summary: e.target.value })
            }
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <button className="btn" disabled={busy}>
          Save public contact details
        </button>
      </form>
    </section>
  );
}
