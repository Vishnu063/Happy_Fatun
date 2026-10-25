# Happy Fatun · Furniture, made personal

A mobile-first furniture concept catalog and private owner studio, implementing [Issue #1](https://github.com/Vishnu063/Happy_Fatun/issues/1). Customers request quotations; there is **no checkout or payment flow**.

## Architecture and tradeoffs

- **React + TypeScript + Tailwind + Vite**: reusable product cards, gallery, customization form, and admin editors. The owner studio and Three.js viewer load on demand.
- **Cloudflare Worker + Hono + D1**: same-origin server APIs, SQL migrations, persistent quote snapshots, price audit, and server-side owner authorization. Cloudflare's free allowances suit an initial catalog; quotas and commercial terms may change. D1 couples deployment to Cloudflare but avoids maintaining a database server. Local Wrangler runs the Worker/D1 runtime without a cloud account.
- **One owner**: PBKDF2-SHA256 password hash (210,000 iterations), random salt, signed 8-hour HttpOnly, SameSite=Strict cookies, Secure in production, origin verification and persistent login throttling. No default credentials, registration, public write access to the catalog, or client-side authorization shortcuts. Rotating the password hash or session secret invalidates existing sessions. Sign-out clears the browser cookie; copied cookies remain valid until expiry/rotation.
- **Resend adapter**: optional server-only provider key, one configured owner recipient, persistent delivery states and retry. Email contains a reference only; customer details stay in the private dashboard. Quotes are saved before email is attempted. A stable provider idempotency key reduces duplicates within the provider's retention window.
- **Three.js**: three original generic sofa/dining/desk geometry demos. These are explicitly **not accurate product models**. Unsupported devices use the gallery. No photo-to-3D claims.
- **24 original demo concepts**: six categories, three original SVG illustrations per category (white background, room scene, alternative view). Illustrations are shared across concepts, not real product photography. No invented pricing, reviews, warranties, stock or delivery promises. All initial prices are unset. Replace with permitted manufacturer-approved assets before business launch.

Wrangler currently depends on an older Undici version; `package.json` overrides it with compatible `7.30.1` to address the advisories reported by npm audit. Validate the local runtime after dependency updates.

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

Wrangler serves the built site and `/api` on port 8787. To work with React hot reload, keep that process running and start `npm run dev` in a second terminal (port 5173). Vite proxies `/api` to Wrangler; only those two localhost Vite origins are accepted in development. Rebuild after changing frontend files when using Wrangler's built assets directly. In restricted sandboxes, Wrangler/Chromium need permission to bind loopback ports. `WRANGLER_LOG_PATH=/tmp/happy-fatun-wrangler.log` can move its logs to a writable location.

The public site works without owner credentials. The studio fails closed with a configuration error until both authentication secrets are set. No placeholder or test password is accepted in production automatically.

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

E2E tests require a build first. They use `/usr/bin/chromium` if available; otherwise run `npx playwright install chromium`. They create a temporary local database and **test-only** owner credentials outside the checkout, then remove them. Your `.dev.vars`, development database and production data are not touched. Desktop and mobile run serially because they share the isolated test database. Screenshots/traces are in ignored `test-results/`; traces may contain test fixture data. See `VALIDATION.md` for actual observed outcomes and boundaries.

## Owner studio

Open **Owner studio** from the navigation or footer. After signing in:

- **Products**: create, edit and delete designs; select a category; edit specs, material/color options, starting price, private internal cost, status, gallery asset URLs and optional generic geometry. Archived designs are hidden publicly. Available status must only be selected after owner approval. Editing a starting price atomically records the previous and new values in the private audit.
- **Categories**: create, rename and delete empty categories. Move/delete their products first.
- **Inquiries**: search by reference/name/area/design; filter by all seven statuses; inspect immutable product/configuration snapshots and customer consent; update private costs/final quote. Minimum margin warnings use `(final price − internal cost) / final price`. Saving a final quote does not automatically send it to the customer; the owner contacts the customer after manufacturer review.
- **Price history**: review server-recorded starting price changes.
- **Settings**: set the minimum margin. Authentication, public contacts and provider secrets are deployment configuration, not browser fields.

Amounts are integer **paise** in the API/database and rupees in the UI. Public payloads whitelist safe fields. Public visitors cannot read inquiries, costs or price audit records. Quote submission is the only public data mutation. It requires server validation, a matching origin, consent, a honeypot and a hashed-IP rate limit. Missing edge IP in local development shares one local rate bucket. Clear expired throttles by waiting for expiry, not by disabling the production limits.

Photo assets are **URL-managed**, not uploaded into D1: add permitted files to `public/assets/` and redeploy, or use a trusted HTTPS image host. First photo should use a white background, second a room, followed by angles/details. Owner controls the order. Do not upload customer or confidential images to public asset storage. Color/material lists are the available customization variants; selections are requests, not feasibility guarantees. Product deletion preserves inquiry snapshots and audit history.

## Notifications and public contact

| Variable                           | Purpose                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `OWNER_PASSWORD_HASH`              | Salted owner password hash, stored as a secret                    |
| `SESSION_SECRET`                   | Random signing secret, at least 32 characters, stored as a secret |
| `EMAIL_MODE`                       | `disabled` (default), `local` (development only), or `resend`     |
| `RESEND_API_KEY`                   | Server-only provider API key                                      |
| `EMAIL_FROM`                       | Provider-approved sender or sender/domain you verified            |
| `OWNER_EMAIL`                      | **One** notification recipient (single valid address)             |
| `BUSINESS_EMAIL`, `BUSINESS_PHONE` | Optional public contact shown after successful quote submission   |
| `ENVIRONMENT`                      | `production` on deployed hosts; `development` only for local use  |

Delivery states: `pending`, `sending`, `sent`, `failed`, `disabled`, `local`. The owner can retry in the inquiry details. Already-sent messages are not resent; stale `sending` claims become retryable after five minutes. Provider errors are not logged with request bodies or customer data. A provider outage never discards a saved inquiry. Check `failed`/`disabled` inquiries in the studio if email is unavailable. Real email needs a Resend account, verified sender and valid key; local mode is not proof of external delivery. No SMS service is required.

## Deployment (Cloudflare free-tier-compatible)

1. Create a Cloudflare account and authenticate Wrangler on your own machine (`npx wrangler login`), or configure a scoped CI token securely.
2. Run `npx wrangler d1 create happy-fatun`. Replace **only** the placeholder `database_id` in `wrangler.jsonc` with the returned ID. Do not deploy the local placeholder. Review your account/database target.
3. Run `npm ci`, `npm run build`, then `npm run db:remote`. The initial migration includes demo concepts without prices; it does not overwrite later edits when reapplied.
4. Configure `OWNER_PASSWORD_HASH` and `SESSION_SECRET` via `npx wrangler secret put NAME` or the Cloudflare dashboard. Do not use the E2E fixtures. For email, also configure `RESEND_API_KEY`; set `EMAIL_MODE=resend`, `EMAIL_FROM`, and `OWNER_EMAIL` in deployment variables. Optional business contacts must be accurate before setting them. Leave `ENVIRONMENT=production` to require Secure cookies.
5. `npm run deploy`. Worker static assets and APIs use the same HTTPS origin. Security headers for assets live in `public/_headers`; API responses are noncacheable. No public CORS access is enabled.
6. Verify live owner sign-in, anonymous write rejection, quote persistence, owner notification, price update and public refresh. Deployment and external email are **unverified until those checks run**. Do not imply that local tests provision accounts or publish the site.

Network destinations: npm registry for install, GitHub for source/PRs (`github.com`, `api.github.com`), Cloudflare API for deploy, Resend API for notifications (`api.resend.com`), and any owner-selected image host. Runtime Worker outbound email is configured on Cloudflare separately from the development machine's network policy.

## Privacy and operational limits

Customer names, contact details, area and configuration are stored in D1 and are owner-only. Use a scoped Cloudflare account, limit dashboard access, keep database backups private, set a business retention policy, and delete expired customer records using an authenticated D1 maintenance command. No customer-record export endpoint is public. Avoid publishing real inquiry data in screenshots, logs or bug reports. Consent only covers replying about the inquiry; this app does not subscribe anyone to marketing.

Before launch, the owner needs to supply/approve brand identity, contact phone/email, delivery areas and real product assets. Configure real email and owner secrets, replace demo content, and review the privacy/retention wording for the business. This project does not invent those business facts. The current hash-router SPA is inexpensive to host, but per-product server-rendered SEO/social previews, image upload/storage, multiple admins, 2FA, automatic customer quote emails, payments, inventory and fulfillment are outside this implementation.
