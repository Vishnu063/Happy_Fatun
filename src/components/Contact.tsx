import type { Business } from "../lib/contact";
import { whatsappURL } from "../lib/contact";
export default function Contact({ business }: { business: Business | null }) {
  const wa = whatsappURL(business?.whatsapp || null);
  return (
    <section className="container prose contact">
      <p className="eyebrow">AARANYA LIVING · LET'S TALK</p>
      <h1>
        Your space.
        <br />
        <em>A personal conversation.</em>
      </h1>
      <p>
        Planning a furniture project? Explore a design, share your preferred
        dimensions, and ask about feasibility and delivery in your locality.
        Exact service areas and timing require owner confirmation.
      </p>
      {business?.summary && <p>{business.summary}</p>}
      <dl className="contact-details">
        {business?.phone && (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${business.phone}`}>{business.phone}</a>
            </dd>
          </div>
        )}
        {business?.email && (
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${business.email}`}>{business.email}</a>
            </dd>
          </div>
        )}
        {business?.address && (
          <div>
            <dt>Business address</dt>
            <dd>{business.address}</dd>
          </div>
        )}
        {business?.service_area && (
          <div>
            <dt>Service area</dt>
            <dd>{business.service_area}</dd>
          </div>
        )}
      </dl>
      {!business?.phone && !business?.email && !wa && (
        <p className="notice">
          Direct contact details are being configured. Request a quote from a
          design page so the owner can review your inquiry and respond using the
          details you provide.
        </p>
      )}
      <div className="actions">
        <a className="btn" href="/?source=contact">
          Choose a design & request a quote
        </a>
        {wa && (
          <a
            className="btn secondary"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chat on WhatsApp
          </a>
        )}
      </div>
      <h2>Your inquiry stays private.</h2>
      <p>
        We request your name, phone, email and delivery area only to review and
        respond to your furniture inquiry. Consent is required on the quote
        form. No marketing subscription or unsolicited outreach is created.
      </p>
      <p className="muted small">
        Aaranya Living · Where Nature Meets Craftsmanship. Working brand pending
        trademark/domain checks; no registration is claimed.
      </p>
    </section>
  );
}
