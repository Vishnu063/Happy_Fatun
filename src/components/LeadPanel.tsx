import { useState } from "react";
import { leadStage, leadStages, type LeadStage } from "../../shared/leads";
export type Lead = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  area: string;
  status: string;
  source: string;
  owner_notes: string;
  follow_up_date: string | null;
  created_at: string;
  product_snapshot: { name: string };
  configuration: { notes: string };
};
export default function LeadPanel({
  leads,
  busy,
  save,
}: {
  leads: Lead[];
  busy: boolean;
  save: (id: string, body: unknown) => Promise<unknown>;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [follow, setFollow] = useState("all");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const visible = leads.filter(
    (q) =>
      (stage === "all" || leadStage(q.status) === stage) &&
      (follow !== "due" ||
        (q.follow_up_date &&
          q.follow_up_date <= today &&
          !["Won", "Lost"].includes(leadStage(q.status)))) &&
      `${q.reference} ${q.name} ${q.area} ${q.source} ${q.product_snapshot.name} ${q.owner_notes}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const won = leads.filter((q) => leadStage(q.status) === "Won").length;
  return (
    <section aria-label="Private lead tracking">
      <h2>Conversations into possibilities.</h2>
      <div className="lead-totals">
        {leadStages.map((s) => (
          <div key={s}>
            <strong>
              {leads.filter((q) => leadStage(q.status) === s).length}
            </strong>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <p className="muted small">
        {leads.length} recorded inquiries ·{" "}
        {leads.length ? ((won / leads.length) * 100).toFixed(1) : "0.0"}% marked
        won. This is an inquiry conversion ratio, not a guarantee of sales.
      </p>
      <div className="filters">
        <label className="search">
          <span className="sr-only">Search leads</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, reference, product, area, notes or source"
          />
        </label>
        <label>
          <span className="sr-only">Lead stage filter</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All lead stages</option>
            {leadStages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Follow-up filter</span>
          <select value={follow} onChange={(e) => setFollow(e.target.value)}>
            <option value="all">All follow-ups</option>
            <option value="due">Due / overdue</option>
          </select>
        </label>
      </div>
      {visible.map((q) => (
        <LeadEditor
          key={q.id + q.status + q.owner_notes + q.follow_up_date}
          lead={q}
          busy={busy}
          save={(body) => save(q.id, body)}
        />
      ))}
      {!visible.length && (
        <p className="empty">No leads match these filters.</p>
      )}
      <p className="muted small">
        Lead stages use the existing quotation record: Contacted = Reviewing;
        Quote Sent = Quoted; Won = Confirmed/Manufacturing/Delivered; Lost =
        Closed. No duplicate customer records or parallel status fields.
      </p>
      <h3>Recorded inquiry sources</h3>
      <div className="source-totals">
        {Array.from(new Set(leads.map((q) => q.source))).map((source) => (
          <span key={source}>
            {source}: {leads.filter((q) => q.source === source).length}
          </span>
        ))}
      </div>
    </section>
  );
}
function LeadEditor({
  lead: q,
  busy,
  save,
}: {
  lead: Lead;
  busy: boolean;
  save: (body: unknown) => Promise<unknown>;
}) {
  const [stage, setStage] = useState<LeadStage>(leadStage(q.status));
  const [notes, setNotes] = useState(q.owner_notes);
  const [date, setDate] = useState(q.follow_up_date || "");
  return (
    <details className="inquiry lead">
      <summary>
        <div>
          <span className="eyebrow">{q.reference}</span>
          <h3>
            {q.name} <span className="badge">{leadStage(q.status)}</span>
          </h3>
          <p>
            {q.product_snapshot.name} · {q.source} · {q.created_at} UTC
          </p>
        </div>
        <span className="muted small">
          {q.follow_up_date
            ? `Follow up: ${q.follow_up_date}`
            : "No follow-up date"}
        </span>
      </summary>
      <form
        className="inquiry-body"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            stage,
            owner_notes: notes,
            follow_up_date: date || null,
          });
        }}
      >
        <p>
          <a href={`mailto:${q.email}`}>{q.email}</a> ·{" "}
          <a href={`tel:${q.phone}`}>{q.phone}</a> · {q.area}
        </p>
        <p className="notes">
          Customer notes: {q.configuration.notes || "None"}
        </p>
        <div className="two-fields">
          <label>
            Lead stage
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
            >
              {leadStages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Follow-up date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        <label>
          Private follow-up notes
          <textarea
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy}>
          Save lead follow-up
        </button>
        <p className="muted small">
          Customer consent covers responding to this inquiry. Saving does not
          send messages or enroll the customer in marketing.
        </p>
      </form>
    </details>
  );
}
