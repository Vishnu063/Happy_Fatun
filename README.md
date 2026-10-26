# Aaranya Living · Where Nature Meets Craftsmanship.

Working brand approved in Issue #1; repository slug remains `Happy_Fatun`. No trademark registration or domain ownership is claimed.

**Requirements audit:** [Full matrix](docs/FINAL_REQUIREMENTS_AUDIT.md). The current five-category pilot uses image galleries; matched-frame 360° is **DEFERRED** by owner instruction, and real model upload/loader is **NOT IMPLEMENTED**. Real contacts/credentials and live D1/R2/email verification remain pending. This is a candidate for owner review, not an unconditional completion or public-launch claim.

A mobile-first local furniture marketplace pilot with a concept catalog and private owner studio, implementing [Issue #1](https://github.com/Vishnu063/Happy_Fatun/issues/1). Customers request quotations; there is **no checkout or payment flow**.

## Free Workers + D1 preview (owner-approved preparation)

The owner chose a preview **without R2**. Use [the exact deployment runbook](docs/FREE_PREVIEW_DEPLOYMENT.md) and `wrangler.preview.jsonc`: no bucket binding, production authentication guards, disabled email, and noindex preview pages. The account ID and existing `happy-fatun` D1 ID are non-secret placeholders awaiting owner review. The owner reports those cloud resources exist; Codex has not accessed or changed them.

Local commands: `npm run preview:check`, `npm run preview:dry-run`, `npm run db:preview:local`, and `npm run dev:preview`. The first two validate/bundle without publishing; the database command is explicitly local. `npm run test:e2e:preview` verifies the no-bucket workflow against isolated local D1. Future `npm run deploy:preview` is gated on reviewed identifiers and **separate owner approval**; no remote migration or deployment was performed.

Static galleries, quotes, owner login, prices/specifications, SEO, leads and contact edits remain available. Without storage, upload/replace/image-delete/cleanup are disabled with a clear owner message. Existing gallery order and alt text can be edited safely. Uploaded-image product records are preserved; archive instead of deleting them. No R2 activation is needed for the preview. The original R2 deployment reference remains opt-in for later approval. Preview quotations show email disabled; this is not verified email delivery or a full production launch.

## Manual deployment preparation

A dispatch-only, commit-pinned GitHub Actions workflow is prepared for the existing no-R2 preview, with secret-free verification and a separate required-reviewer environment gate. It does **not** run on push/PR or apply migrations. Configure non-secret `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` variables and protected environment `cloudflare-preview`; the owner reports `CLOUDFLARE_API_TOKEN` is already saved. See [setup, plan limitations, immutable SHA selection and separate migration prerequisites](docs/MANUAL_CLOUDFLARE_DEPLOYMENT.md). The repository is public; GitHub Free private repositories do not support the required reviewers, and the workflow blocks private visibility. Default-branch workflow availability and deployment need separate approval. No dispatch or deployment was performed.

## Marketplace and inquiry scope

Latest owner decisions define managed quotation/supplier coordination in Kharadi, Hadapsar, Magarpatta, Manjari and Mundhwa. This is intended launch geography, not verified stock or a delivery guarantee. The product CTA opens a short form requiring full name and valid Indian mobile; email, delivery area/address and message are optional, and customization is collapsed with prefilled defaults. Explicit consent, no marketing opt-in, server-bound product snapshots, rate limits and idempotent receipts are preserved. Private inquiry/lead views support phone search, contact links, follow-up notes/dates, product supplier comparison and confirmed personal-data removal while retaining the commercial record.

Future owner-only orders and manual customer-payment reconciliation are **planned, not implemented or enabled**. The owner intends Aaranya Living to collect payments after acceptance, with manual verification; no checkout, payment instructions, card data, gateway or real payment acceptance is added. See [marketplace roadmap and approval boundaries](docs/MARKETPLACE_ROADMAP.md).

## Architecture and tradeoffs

- **React + TypeScript + Tailwind + Vite**: reusable product cards, gallery, customization form, and admin editors. The private owner studio loads on demand; the public pilot uses responsive image galleries.
- **Cloudflare Worker + Hono + D1**: same-origin server APIs, SQL migrations, persistent quote snapshots, price audit, and server-side owner authorization. Cloudflare's free allowances suit an initial catalog; quotas and commercial terms may change. D1 couples deployment to Cloudflare but avoids maintaining a database server. Local Wrangler runs Worker/D1/R2 emulation without a cloud account. Uploaded image bytes live in object storage, with type/size/alt/classification metadata and ordering in D1. No production bucket or account was created.
- **One owner**: PBKDF2-SHA256 password hash (210,000 iterations), random salt, signed 1-hour HttpOnly, SameSite=Strict cookies, Secure in production, origin verification and persistent login throttling. No default credentials, registration, public write access to the catalog, or client-side authorization shortcuts. Rotating the password hash or session secret invalidates existing sessions. Sign-out revokes the server-side D1 session and clears the browser cookie. Copied cookies are rejected after successful logout.
- **Resend adapter**: optional server-only provider key, one configured owner recipient, persistent delivery states and retry. Email contains a reference only; customer details stay in the private dashboard. Quotes are saved before email is attempted. A stable provider idempotency key reduces duplicates within the provider's retention window.
- **Five-category pilot**: dining tables, beds, wardrobes, chairs and coffee tables. Five original AI-generated studio concepts are featured, clearly labeled as illustrations rather than available stock. Optimized responsive WebP assets are documented in [asset provenance](public/assets/pilot/README.md). Twenty-four legacy records remain intact and retain saved URLs; 29 records exist after migration, with 21 in the initial priority collection. No new GLB/3D models or matched-frame 360 viewer are included.
- **Private Shop & Supplier Tracking**: normalized D1 shops and per-product sourcing records, multiple suppliers, optional costs/selling prices/contact details, search/filter/compare, editing and archive/restore. Supplier contacts and gross margins never set public prices or appear in public APIs/SEO/quotes. [Workflow and limits](docs/PILOT_CATALOG_SUPPLIERS.md).

Wrangler currently depends on an older Undici version; `package.json` overrides it with compatible `7.30.1` to address the advisories reported by npm audit. Validate the local runtime after dependency updates.

Before each development phase, run `npm run brief` and follow the current Issue #1 and PR #2 instructions. Keep PR #2 open; do not merge/deploy, configure paid services/secrets, or use EC2 without explicit owner direction. See `AGENTS.md` and `docs/PHASES.md`.

## Requirements and first run

Node **24+** and npm. Node's built-in SQLite module is used by the API tests. Use the existing checkout; tasks already run in isolated environments and do not need a new Git worktree.

```sh
cd /workspace/Happy_Fatun # or your existing checkout
npm ci
npm run build
npm run db:local
cp .dev.vars.example .dev.vars
```

Edit the ignored `.dev.vars` to configure local owner authentication:

1. Choose a unique password of at least 14 characters. Run `npm run --silent owner:hash`, enter the password on stdin, and end input with Ctrl-D. The script outputs **only a salted hash**. For terminals with echo, use `read -rs` or pipe from a password manager to keep the password off screen. Do not put it in shell arguments/history.
2. Put the generated hash in `OWNER_PASSWORD_HASH`.
3. Generate `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and put it in `.dev.vars`. Keep secrets private; never commit this file.
4. `ENVIRONMENT=development` permits local HTTP cookies. `EMAIL_MODE=local` records simulated delivery; it sends **no real email**.

Start the built full stack:

```sh
npm run dev:api
```

Wrangler serves the built site and `/api` on port 8787. To work with React hot reload, keep that process running and start `npm run dev` in a second terminal (port 5173). Vite proxies `/api` and `/media` to Wrangler; only those two localhost Vite origins are accepted in development. Stop Wrangler, rebuild, and restart it after changing production assets when using the built site directly; use Vite for frontend hot reload. In restricted sandboxes, Wrangler/Chromium need permission to bind loopback ports. `WRANGLER_LOG_PATH=/tmp/happy-fatun-wrangler.log` can move its logs to a writable location.

The public catalog works without owner credentials. Quote submission requires a random SESSION_SECRET of at least 32 characters and fails closed without it. The studio fails closed with a configuration error until both authentication secrets are set. No placeholder or test password is accepted in production automatically.

## Commands and verification

| Command             | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm ci`            | Reproducible dependency installation from the lockfile                          |
| `npm run build`     | Strict TypeScript check and optimized production build                          |
| `npm test`          | API integration tests using an isolated SQLite database per test                |
| `npm run test:e2e`  | Desktop/mobile Chromium smoke tests against an isolated real Worker/D1 instance |
| `npm run db:local`  | Apply migrations to local persistent D1 (safe to repeat)                        |
| `npm run db:remote` | Apply migrations to the configured remote D1; review target first               |
| `npm run deploy`    | Build and deploy to your authenticated Cloudflare account                       |

E2E tests require a build first. They use `/usr/bin/chromium` if available; otherwise run `npx playwright install chromium`. They create a temporary local database and **test-only** owner credentials outside the checkout, then remove them. Your `.dev.vars`, development database and production data are not touched. Desktop and mobile run serially because they share the isolated test database. Screenshots/traces are in ignored `test-results/`; traces may contain test fixture data. Latest local verification: **73 API/security/SEO/configuration/catalog/supplier/inquiry/deployment tests passed**; all **10 storefront and 6 no-R2 preview browser cases passed**, with zero dependency audit findings. Formatting, production build, non-deploying guard and local migration/repeat checks passed. See `VALIDATION.md` for actual observed outcomes and boundaries; commit-specific CI is recorded on PR #2.

## Catalog growth, galleries and reliable image cleanup

Hero and collection search share filters, category navigation uses descriptive URLs, and each product card has a direct quote link. The five-category pilot starts with 21 records; collections above 24 use accessible progressive loading. API/browser checks use 300 distinct **isolated fixtures**, not duplicate stock. The API fetches the complete selected category scope; server pagination remains future work for much larger catalogs.

Public image galleries retain zoom, keyboard and touch. Five original studio concepts have one view each, without false rotation controls. Legacy model data/code are preserved but no generic 3D viewer is exposed in this release. Matching 24–36 approved frames and a future image-sequence viewer remain pending by owner instruction; no new 3D assets were created.

Apply migrations through `0010_private_suppliers.sql` (0009 adds the pilot concepts; 0010 adds private sourcing, preserving existing records). Image metadata is registered before external writes. Removed objects enter a durable D1 cleanup queue independent of product deletion; provider failures retain retry keys. Owner Settings shows queued/interrupted counts and retries up to 50 objects per action. Staged uploads receive a five minute grace period, and abandoned metadata is reconciled on owner retry; there is no automatic scheduled sweeper. An unavailable database can interrupt a mutation, so reload before retrying; this is not a distributed transaction across D1/R2. Tests cover provider and persistence failures with isolated emulation, not a live cloud outage.

## Gallery inspection and reliable quote retries

Product galleries support keyboard/swipe navigation and an accessible image-zoom dialog. Use the zoom/reset controls, scroll to inspect details, or press Escape to return focus to the gallery. The default customization material matches the listed primary material when that option is available. Concept illustrations remain clearly labeled; the public pilot exposes no generic demo geometry.

The browser keeps a random submission key for a form's lifetime. If the server saves an inquiry but its response is interrupted, retrying that unchanged form returns the original reference and does not create another inquiry or notification. The unique database key also handles concurrent retries. Reusing the key with changed details returns a conflict; refresh explicitly to start a new inquiry. A reload/new form creates a new key, so this is not blanket deduplication by customer email. Legacy API clients without `submission_key` remain supported and rate-limited. All requests, including retries, remain subject to quote throttling. Apply migration `0005_quote_submission_keys.sql` before running the updated API. Opaque submission digests/fingerprints are kept private and excluded from owner API payloads.

## Owner studio

Open **Owner studio** from the navigation or footer. After signing in:

- **Products**: create, edit and delete designs; select a category; edit specs, material/color options, starting price, private internal cost, status, gallery uploads/order/replacement and optional generic geometry. Archived designs are hidden publicly. Available status must only be selected after owner approval. Editing a starting price atomically records the previous and new values in the private audit.
- **Categories**: create, rename and delete empty categories. Move/delete their products first.
- **Inquiries**: search by reference/name/area/design; filter by all seven statuses; inspect immutable product/configuration snapshots and customer consent; update private costs/final quote. Minimum margin warnings use `(final price − internal cost) / final price`. Saving a final quote does not automatically send it to the customer; the owner contacts the customer after manufacturer review.
- **Price history**: review server-recorded starting price changes.
- **Leads**: search/filter the same inquiries by New, Contacted, Quote Sent, Won or Lost; save private follow-up notes/dates; review totals, sources and inquiry-to-won ratios. Stages map to existing quotation status: Reviewing→Contacted, Quoted→Quote Sent, Confirmed/Manufacturing/Delivered→Won, Closed→Lost. Keep a completed won order Delivered rather than Closed if it should remain in won totals.
- **Settings**: configure accurate public contact/WhatsApp/address/service-area/introduction fields and the minimum margin. Authentication and notification provider secrets remain server configuration. Public contact fields never change the private notification recipient.

Amounts are integer **paise** in the API/database and rupees in the UI. Public payloads whitelist safe fields. Public visitors cannot read inquiries, costs or price audit records. Quote submission is the only public data mutation. It requires server validation, a matching origin, consent, a honeypot and a hashed-IP rate limit. Missing edge IP in local development shares one local rate bucket. Clear expired throttles by waiting for expiry, not by disabling the production limits.

Image management is owner-only and saved immediately: upload PNG/JPEG/WebP, reorder, replace a selected slot or delete while keeping at least one image. The browser strips metadata and converts to WebP (longest side ≤1600px). Sources must be ≤12 MB, ≤6000px/side and ≤24 megapixels; the server checks raster signatures/container dimensions, declared MIME and a ≤5 MB upload limit. SVG uploads are rejected. R2 stores bytes outside source code; D1 stores metadata and ordered image references. No code deployment is needed for replacement after the storage binding is configured. The local R2 emulator is included. Real production storage requires owner approval/setup; no paid service or billing configuration was performed. First view should be white studio, second the exact same furniture in a room. AI/concept images must be classified illustrative; approved real photos may be classified photo. Do not upload private/customer material to this public product-image storage. Existing product IDs, prices, descriptions and inquiry records are preserved. Removed image URLs may become unavailable; quote text/configuration/price snapshots remain stored.

Descriptive `/design/<name>/<id>` and `/collections/<name>/<id>` URLs retain stable product IDs. Legacy product paths redirect and old hash links remain compatible. The Worker serves initial public summaries, unique titles/descriptions/canonicals and safe schema without requiring JavaScript. `/sitemap.xml` reflects current public products/categories. Archived/missing designs are excluded; owner routes are noindex. Concept designs use CreativeWork schema rather than fabricated stock/offer/rating data. No address, reviews, availability or fixed prices are invented.

Owner product/category editors support optional SEO titles (70 characters) and meta descriptions (180); empty values use defaults. Image alt text can be edited without re-uploading, including placeholder galleries. Distinct category planning guidance and two original buying guides are rendered in React and crawlable server HTML. Guides are maintained as reviewed source in `shared/content.ts`, not an admin CMS. Default geographic claims were removed; only configured owner service-area facts may appear. See [organic search launch checklist](docs/ORGANIC_SEARCH_LAUNCH.md) for owner Search Console verification, sitemap submission and indexing monitoring. Implemented SEO is **not proof of indexing, Google rankings or real inquiries**.

See `docs/LOCAL_ACQUISITION.md` for the post-launch owner checklist. Source attribution uses an allowlisted campaign source in browser-tab storage, with no cross-site identifier. Live visitor analytics and bulk outreach remain deferred; lead counts are not unique visitor counts or guaranteed sales.

## Notifications and public contact

| Variable                           | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `OWNER_PASSWORD_HASH`              | Salted owner password hash, stored as a secret                      |
| `SESSION_SECRET`                   | Random signing secret, at least 32 characters, stored as a secret   |
| `EMAIL_MODE`                       | `disabled` (default), `local` (development only), or `resend`       |
| `RESEND_API_KEY`                   | Server-only provider API key                                        |
| `EMAIL_FROM`                       | Provider-approved sender or sender/domain you verified              |
| `OWNER_EMAIL`                      | **One** notification recipient (single valid address)               |
| `BUSINESS_EMAIL`, `BUSINESS_PHONE` | Optional public contact shown on Contact/product/confirmation pages |
| `ENVIRONMENT`                      | `production` on deployed hosts; `development` only for local use    |

Delivery states: `pending`, `sending`, `sent`, `failed`, `disabled`, `local`. The owner can retry in the inquiry details. Already-sent messages are not resent; stale `sending` claims become retryable after five minutes. Provider errors are not logged with request bodies or customer data. A provider outage never discards a saved inquiry. Check `failed`/`disabled` inquiries in the studio if email is unavailable. Real email needs a Resend account, verified sender and valid key; local mode is not proof of external delivery. No SMS service is required.

## Opt-in R2 deployment reference (future separate owner approval)

1. Create a Cloudflare account and authenticate Wrangler on your own machine (`npx wrangler login`), or configure a scoped CI token securely.
2. Run `npx wrangler d1 create happy-fatun`. Replace **only** the placeholder `database_id` in `wrangler.jsonc` with the returned ID. Do not deploy the local placeholder. Review your account/database target.
3. Configure an owner-approved product-image bucket and bind it as `PRODUCT_IMAGES` (the example uses `aaranya-product-images`). Local tests use emulation only; no real bucket exists from this work. Review provider eligibility, quotas and account requirements before enabling production storage. Run `npm ci`, `npm run build`, then `npm run db:remote`. The initial migration includes demo concepts without prices; it does not overwrite later edits when reapplied.
4. Configure `OWNER_PASSWORD_HASH` and `SESSION_SECRET` via `npx wrangler secret put NAME` or the Cloudflare dashboard. Do not use the E2E fixtures. For email, also configure `RESEND_API_KEY`; set `EMAIL_MODE=resend`, `EMAIL_FROM`, and `OWNER_EMAIL` in deployment variables. Optional business contacts must be accurate before setting them. Leave `ENVIRONMENT=production` to require Secure cookies.
5. `npm run deploy:check` checks the production environment guard without deploying or proving accounts/credentials ready. The wrapper supports only `--dry-run` and one `--env`/`-e` selection; joined aliases, duplicate selections and variable/config overrides are rejected. Inherited development mode is rejected and `CLOUDFLARE_ENV` is checked. `npm run deploy` uses that guard. Public-host APIs fail closed if development mode is enabled. Worker static assets and APIs use the same HTTPS origin. Security headers for assets live in `public/_headers`; API responses are noncacheable. No public CORS access is enabled.
6. Verify live owner sign-in, anonymous write rejection, quote persistence, owner notification, price update and public refresh. Deployment and external email are **unverified until those checks run**. Do not imply that local tests provision accounts or publish the site.

Network destinations: npm registry for install, GitHub for source/PRs (`github.com`, `api.github.com`), Cloudflare API for deploy, Resend API for notifications (`api.resend.com`), and any owner-selected image host. Runtime Worker outbound email is configured on Cloudflare separately from the development machine's network policy.

## Privacy and operational limits

Customer names, contact details, area and configuration are stored in D1 and are owner-only. Use a scoped Cloudflare account, limit dashboard access, keep database backups private, set a business retention policy, and delete expired customer records using an authenticated D1 maintenance command. No customer-record export endpoint is public. Avoid publishing real inquiry data in screenshots, logs or bug reports. Consent only covers replying about the inquiry; this app does not subscribe anyone to marketing.

Before launch, the owner needs to confirm contact phone/email, delivery areas and business details; polished images can be replaced later under the approved placeholder-first workflow. Configure real email and owner secrets, replace demo content, and review the privacy/retention wording for the business. This project does not invent those business facts. Multiple admins, 2FA, automatic customer quote emails, payments, inventory and fulfillment are outside this implementation. Live deployment, external email, production R2 and real-world acquisition remain unverified.
