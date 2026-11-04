# Run the Aaranya Living website with its database

This is the existing furniture website: React storefront → Hono API → persistent PostgreSQL, plus private persistent image storage. Cloudflare/D1 remains an alternative deployment path. A public launch has not been performed.

## Available website features

- Responsive catalog, five priority furniture categories plus ten merchandise categories, search/option filters and product pages.
- Image galleries, dimensions/material/color customization and customer quotation requests.
- Saved inquiry reference numbers and retry protection; customer inquiries remain private.
- Owner-only Master Control for products, prices, image uploads, inquiries, follow-up, suppliers and cost comparison. Supplier contacts/costs/margins are never public catalog fields.
- Price history, authentication/session revocation, server validation, SEO and crawlable product pages.

Concept images are illustrative, not verified inventory. The latest PR request for ten additional photorealistic designs and licensed matching interactive GLB assets is still pending on the furniture branch; this guide does not claim those exist. Preview email is disabled; inquiries are saved even without email. Checkout and real payment acceptance remain outside the current public website.

## Start locally

Requires Node 24+, Docker Engine/Compose and sufficient build disk space. Keep the existing checkout/branch. Do not point Docker at an existing EC2 server.

1. Install dependencies: `npm ci`.
2. Generate private configuration once. In Bash, enter your own unique owner password without showing or saving the plaintext:

   ```sh
   read -r -s -p 'Local owner password (14–256 characters): ' website_owner_password
   printf '%s' "$website_owner_password" | npm run --silent lab:env
   unset website_owner_password
   ```

   This creates ignored `.env.lab` with a salted password hash and random database/session secrets. Existing files are never overwritten. Never paste credentials into chat or commit this file.

3. Run `npm run website:up`.

The command builds the three local images, applies the ten forward migrations through the existing one-shot service, waits for health and checks the database-backed catalog. It only uses the local Docker socket and its dedicated `happy-furn-website` Compose project. It creates a **new local database**; it never imports or changes existing live D1/customer data. Build failures stop startup; database migrations are not part of application startup.

Open **http://127.0.0.1:8081** and **http://127.0.0.1:8081/admin**. Sign in with the password you entered. Edit your business profile/contact details in the private settings; no business details are invented.

If port 8081 is occupied, leave that application running and use `FRONTEND_PORT=18081 npm run website:up` (use the same override for later commands). Ports 8080 and 8090 are reserved and rejected by the wrapper. The website is loopback-only, not publicly exposed. In a remote workspace, localhost belongs to that workspace; these URLs are not public internet links.

- `npm run website:status` shows container health.
- `npm run website:down` stops this project **without deleting database or image volumes**.
- `npm run website:up` starts it again with the saved data. Do not use volume deletion/reset commands for customer data.

The setup is for a local preview, not production credentials, TLS or backups. On permission/port/build errors, fix the reported problem without resetting the database. See [the detailed runtime runbook](aws/README.md) for production prerequisites, configuration and rollback.

## Verify the actual website and database

```sh
npm run test:website
```

Requires the three local images built by `website:up` (or the individual Docker build commands in the runtime runbook) and Chromium installed for Playwright (`npx playwright install chromium`, or system Chromium). Uses a separate disposable database and random loopback port, never the persistent website project. Both desktop and mobile browsers exercise search → product customization → submit inquiry → owner login → find the saved inquiry after reload → logout/authorization. The existing API smoke then checks PostgreSQL outage/recovery and inquiry persistence, supplier privacy and forged-header rate limits. Only its own fixture containers/volumes are removed. Screenshots contain synthetic data under `test-results/website/`.

**Before a public launch:** configure reviewed hosting/domain/TLS and secrets, real business/contact information, approved catalog inventory/images, email delivery, privacy/retention policies, backups/restore and live integration validation. Publishing/deploying still requires owner approval. See [verified results and limitations](aws/VALIDATION.md).
