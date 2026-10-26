# Aaranya Living: Workers + D1 preview without R2

Prepared for [the owner's no-R2 decision](https://github.com/Vishnu063/Happy_Fatun/pull/2#issuecomment-6403374627). These are **future operator instructions**, not evidence of deployment. No remote migration, secret installation, account change, paid-service activation or deployment was performed by Codex.

Manual Actions option: [secure manual workflow setup](MANUAL_CLOUDFLARE_DEPLOYMENT.md) documents the two ID variables, required environment reviewers and exact reviewed SHA. It never combines deployment with migrations or secret installation. The CLI procedure below remains a separate owner-authorized path; no workflow was dispatched.

## What is prepared and verified locally

`wrangler.preview.jsonc` uses Worker `aaranya-living-preview`, the existing database name `happy-fatun` bound as `DB`, built static files as `ASSETS`, and **no R2 binding**. `ENVIRONMENT=production` retains production authentication/cookie guards. `EMAIL_MODE=disabled` persists inquiries without sending mail. `PREVIEW_MODE=true` preserves SEO metadata/canonical/sitemap generation but sets HTML noindex and disallows crawling; this is a preview, not a search-index launch. Noindex is not access control: anyone with its public URL can browse and submit an inquiry once configured.

The bundled static concept images stay available. Upload/replace/image-delete and cleanup actions return 503 before mutations without R2; owner controls show “unavailable in preview.” Static gallery order and alt text, product prices/specifications/SEO/archive, categories, leads, quotes and contacts remain available behind the existing owner authorization. New products use static/approved HTTPS images; new `/media/` references are rejected. Static-only products without supplier history can be deleted with quote snapshots retained. Products with supplier links must be archived to retain sourcing history. Products with uploaded-image registry entries or `/media/` references cannot be deleted without storage: archive them instead. Existing references/cleanup obligations are preserved, never rewritten or purged. Existing R2-backed images cannot be served without their bucket; the image fallback applies. A new/empty database's demo galleries need no bucket.

**This cloud preview uses the existing D1 database, not a disposable copy.** After an approved deployment, quotes and authorized owner edits write to that database and may be visible to any other application using it. Confirm that sharing this target is acceptable before publishing; use only isolated local fixtures for testing here. If the owner needs a separate cloud sandbox, that requires a separately approved database/identifier decision.

The preview now uses all ten migrations (0001–0010) without R2. New additive migration 0009 adds five concept records and 0010 adds private supplier tables; neither resets existing products, quotes or authentication. Back up and inspect existing schema/category IDs before any future approved remote migration; investigate conflicts rather than resetting data. The original `wrangler.jsonc` remains the opt-in R2 deployment reference. Use the **preview commands** here for this owner decision; activating R2 needs a separate future owner decision.

## 1. Review the target and obtain approval

Before any account-side step below, the owner must approve the intended Worker creation, D1 target, migration changes, secret installation and deployment. The owner already reports a Cloudflare account and D1 database named `happy-fatun`; those resources and our access to them are **not independently verified**.

Collect only the **non-secret** Cloudflare Account ID (32 hexadecimal characters), existing D1 Database ID (UUID), and the intended account's workers.dev subdomain. Find the IDs in Cloudflare dashboard → account overview and Workers & Pages → D1 → `happy-fatun`. Do not send passwords, hashes, session secrets or API tokens in chat.

Edit only `account_id` and `d1_databases[0].database_id` in `wrangler.preview.jsonc`, replacing its zero placeholders. Confirm `database_name` is still `happy-fatun`, the binding is `DB`, the Worker name is `aaranya-living-preview`, and no `r2_buckets`, custom routes or named environments were added. IDs are identifiers, not credentials. The publishing wrapper rejects placeholders, arbitrary config/environment overrides, R2 bindings and target-name drift. That guard checks configuration, **not cloud ownership, existing data or plan eligibility**.

In the dashboard, confirm Workers **Free**, D1 eligibility/usage, and an available workers.dev subdomain. Check whether `aaranya-living-preview` already exists; if it does, stop and review its use before overwriting it. Keep R2 unactivated. Do not select Workers Paid, add-on purchases, a custom domain purchase or any upgrade to satisfy a CLI prompt.

## 2. Local verification (no cloud mutation)

From the existing checkout on Node 24+:

```sh
npm ci
npm run format:check
npm run preview:check
npm run preview:dry-run
npm test
npm run test:e2e
npm run test:e2e:preview
```

`preview:check` validates the template without authentication or deployment. `preview:dry-run` builds and runs Wrangler's **deploy --dry-run** against the reviewed preview config: it only bundles/reports bindings. Its verified output contains `DB`, `ASSETS` and three preview variables, with no R2. Template placeholders are permitted only for local checks/dry-run, never publication. The browser suites use separate temporary local D1 databases and test-only secrets; the preview suite starts with no R2 and email disabled. Neither suite uses the actual database ID or changes the owner's local database.

Optional local preview: configure the ignored `.dev.vars` as described in README with development-only local authentication and `EMAIL_MODE=disabled`, then run `npm run db:preview:local` followed by `npm run dev:preview`. The migration command explicitly targets local storage for this config; it does not contact the live database. Deployment uses production values from the reviewed config; `.dev.vars` must never be committed or uploaded as business configuration.

## 3. Owner-authorized cloud login and read-only target/migration review

Run these on the owner's machine only after approval for cloud access. Browser-based `login` authenticates the local CLI; `whoami` identifies its account memberships. It is not proof that the selected database is correct.

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 info happy-fatun --config wrangler.preview.jsonc
npx wrangler d1 execute happy-fatun --remote --config wrangler.preview.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npx wrangler d1 migrations list happy-fatun --remote --config wrangler.preview.jsonc
```

Compare the returned account/database identifiers with the reviewed file. The last two commands read schema/migration state; they do not apply migrations. **`migrations list` is a pending-file preview, not a dry-run simulation of remote DDL.** Review each pending SQL file in `migrations/`. Do not assume the database is empty. If tables exist without matching migration history, stop for reconciliation; do not reset/drop/reseed existing tables or mark migrations applied just to bypass an error.

Back up existing data privately before approved schema changes. This exports data (possibly including customer PII), not a public artifact:

```sh
umask 077
mkdir -p ../aaranya-private-backups
chmod 700 ../aaranya-private-backups
preview_backup="../aaranya-private-backups/happy-fatun-before-preview-$(date -u +%Y%m%dT%H%M%SZ).sql"
npx wrangler d1 export happy-fatun --remote --config wrangler.preview.jsonc --output "$preview_backup"
chmod 600 "$preview_backup"
```

Review/test a restoration procedure privately before relying on the backup. Do not commit, paste or publish it. Remote backup/restore is unverified in this work.

## 4. Apply migrations and publish ONLY after explicit owner approval

The following commands **change cloud resources**. Do not run them merely because local tests pass. Confirm the target review/backup and owner's final approval first:

```sh
npx wrangler d1 migrations apply happy-fatun --remote --config wrangler.preview.jsonc
npm run deploy:preview
```

The first command applies pending forward migrations to the existing D1 database. It does not require R2 and must not be replaced with a reset or seed replay. The second rebuilds, validates the production preview profile and publishes the Worker/static assets bound to that database. It does not apply remote migrations automatically. Do not bypass a target/config guard failure with raw deployment overrides.

Before authentication secrets are installed, owner login and quote submission fail closed. Keep the preview URL unshared until secrets and smoke checks are complete. Initial deployment must not overwrite another worker; it should create only the approved preview Worker.

## 5. Install owner secrets privately through Wrangler

These commands also change the Worker's deployed configuration and require the approval above. Use a unique **14–256 character** owner password. On Bash, enter it locally without terminal echo; the hash goes directly to Wrangler, never into arguments, chat, source or a file:

```sh
set -euo pipefail
read -r -s -p 'Preview owner password: ' preview_owner_password
printf '\n'
preview_owner_hash="$(printf '%s' "$preview_owner_password" | node scripts/owner-hash.mjs)"
unset preview_owner_password
printf '%s' "$preview_owner_hash" | npx wrangler secret put OWNER_PASSWORD_HASH --config wrangler.preview.jsonc
unset preview_owner_hash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET --config wrangler.preview.jsonc
```

Set the password hash first, signing secret last. `owner-hash.mjs` uses the existing salted PBKDF2-SHA256 scheme; the signing secret is 32 random bytes (64 hex characters). Store the password securely in the owner's password manager. Wrangler may publish a new Worker version when secrets change. Do not use test credentials, print secret values or put them in `wrangler.preview.jsonc`. Email stays disabled; no Resend key, R2 subscription or billing setup is needed.

If using a shell that does not support these Bash commands, use the owner's secure local password-manager/interactive `wrangler secret put` flow instead; never paste secrets into chat. If a CLI command fails, stop and inspect the error rather than weakening authentication.

## 6. Verify the actual workers.dev preview before sharing

Wrangler prints the actual URL. Its expected shape is `https://aaranya-living-preview.<OWNER_SUBDOMAIN>.workers.dev`; the subdomain is not known here and no live URL is claimed.

At the real URL, verify static images/catalog/product pages, metadata and noindex headers, owner login, unauthorized direct writes rejected, quote reference and persisted owner-only configuration, price/spec update and public refresh, logout revocation, and disabled storage UI/API without gallery changes. Check that the initial collection shows only the five priority categories and each concept is labeled. In Master Control, use owner-approved non-customer test records to verify private shop/link creation, comparison, editing and archive/restore; confirm public JSON/HTML never contains contacts/costs/margins and supplier prices never change public prices. Do not delete existing products or sourcing history. Email status should be **disabled**, not sent. Review private inquiries in the dashboard manually. Do not put real customer data into a test or public bug report.

Check Workers logs/metrics for quota/CPU errors, including owner password verification under the Free plan. Local emulation/dry-run cannot prove Cloudflare's live CPU accounting or limits. Stop and report a provider-limit failure; do not downgrade hashing/session security or activate a paid plan to conceal it. Configure only truthful business contacts/service area in owner Settings after owner review.

## Free-tier and usage protection

Check Cloudflare's current official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) alongside the account dashboard. Confirm plan-specific request/CPU, D1 daily rows read/written, database/account storage and static-asset limits before sharing, and monitor them afterward. Provider quotas/terms can change; local compatibility is not a free-usage guarantee.

Keep the account/Worker on Free, R2 unactivated, email disabled and all paid add-ons unselected. Review Billing/Subscriptions and Usage regularly. Usage alerts are notifications, **not spending caps**. Existing login/quote throttles, consent and server validation stay enabled, but distributed abuse can still exhaust free allowances. Share the preview narrowly while testing; noindex does not prevent abuse. On exhausted allowances, pause public sharing and review usage instead of approving an upgrade. No marketing campaigns, paid ads or search indexing launch is part of preview preparation.

Live Cloudflare deployment, D1 migration/backup, credentials, quota behavior, real email and external customer acquisition remain unverified until the owner authorizes and performs those checks.
