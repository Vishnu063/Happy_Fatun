# Verification record

Observed in the managed development environment on 25 October 2026. These results concern the local implementation; they do not establish production deployment or external email delivery.

## Passed

| Check                         | Actual result                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund` | Clean lockfile installation succeeded (160 packages)                                                    |
| `npm run build`               | Strict TypeScript + Vite production build passed                                                        |
| `npm test`                    | **14 API integration tests passed**, no skipped tests                                                   |
| `npm run test:e2e`            | **4 Chromium tests passed**, two desktop and two Pixel 7 mobile-profile tests                           |
| Automated accessibility       | Axe WCAG 2 A/AA + 2.1 AA rules: no violations on catalog and signed-in inquiry dashboard, both profiles |
| `npm run format:check`        | Passed after formatting source, tests and configuration                                                 |
| `npm audit`                   | **0 known vulnerabilities** after compatible dependency updates and Undici override                     |
| Local D1 migrations           | Initial seed applied; two subsequent applications reported no pending migrations                        |
| Standard startup              | `npm run dev:api` served HTML, health JSON, catalog JSON and SVG with HTTP 200                          |
| Standard catalog request      | 24 demo concepts; private cost fields absent                                                            |

API tests exercise anonymous admin rejection; cross-origin mutation rejection; oversized/invalid JSON; missing consent, honeypot, bounds and unsupported materials; password/session validation and login throttling; production cookie flags and expiry; price persistence/audit; product/category CRUD; immutable inquiry snapshots after product deletion; configuration persistence/unique references; quote rate limits; failed-email persistence and retry to exactly one owner; configured public contacts; status and minimum-margin calculations. Tests use SQLite and the actual Worker application handlers. Email transport is mocked only in the provider-specific tests.

Browser tests use the real local Worker/D1 runtime and built static assets. They cover search, category/material and price filtering, ascending/descending price sorting, gallery buttons/keyboard, synthetic touch swipe on the mobile profile, optional 3D canvas or unavailable-device fallback, customized quote submission, stored configuration in the dashboard, login/logout, anonymous direct write rejection, margin warning, price edit/audit/public refresh, and product/category creation/rename/deletion. They check horizontal overflow and uncaught browser errors on the primary flow. Isolated test data and credentials are removed with the test server. Mobile emulation and synthetic touch are not proof of behavior on every physical device.

Initial failures were investigated and resolved: npm peer version conflict; TypeScript JSON typing; browser selector/touch fixture errors; contrast on the hero note/decorative text; keyboard access to the mobile process strip; and a redundant private reload after sign-out. No assertions were disabled to obtain passing results. Dev-tool advisories were addressed with patched versions and a compatible override; the final runtime tests use those packages.

## Delivery phases

1. Repository inspection, baseline architecture and documented commands.
2. Catalog with 24 clearly labeled original demo concepts, search/filter/sort, related designs and responsive gallery.
3. Persisted quote requests, full configuration snapshots, unique references, consent, input validation and throttling.
4. Server-authorized owner studio with product/category CRUD, asset URL management, prices, quote statuses, private calculations and price audit.
5. Configurable single-owner email adapter with delivery status/retry; three generic concept geometry models with explicit labeling and fallback.
6. Local build, integration/browser/accessibility checks, CI configuration and deployment instructions.

## Not verified / external prerequisites

- No Cloudflare account/database was provisioned and no production site was deployed. The checked-in D1 database ID is deliberately a placeholder. Replace it and configure server secrets before deployment.
- No real email was sent. Configure Resend, a verified sender and the single owner recipient, then verify live delivery. `local` is a simulated status, not a sent message.
- Real owner credentials, business phone/email, service areas and manufacturer-approved product photos are not supplied. Initial catalog prices are unset; demo geometry does not represent actual products. Asset management uses approved file/HTTPS links; direct upload storage is not included.
- Automated accessibility checks cover the named screens; a complete manual assistive-technology audit and physical-device matrix have not been performed.
- GitHub API access was denied by the development network proxy (HTTP CONNECT 403 to `api.github.com`). An allowlist addition was saved in the environment configuration draft. A draft save does not apply or publish that network change. PR creation must be retried after the change becomes effective; this document does not assert a PR exists.
