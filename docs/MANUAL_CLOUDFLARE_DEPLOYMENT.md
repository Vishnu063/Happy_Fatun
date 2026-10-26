# Secure manual Cloudflare preview workflow

Prepared for the [owner's PR #2 instruction](https://github.com/Vishnu063/Happy_Fatun/pull/2#issuecomment-6406661550). **Preparation only: no workflow dispatch, deployment, remote D1 operation, secret installation or paid service activation was performed.** The owner reports a replacement restricted API token is already saved. Its value and permissions were not read, printed or tested.

## Required configuration

In GitHub → repository Settings → Secrets and variables → Actions, or the protected environment's Variables tab:

| Kind / name                          | Required value                                                              | Where to find it                                                          |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Secret `CLOUDFLARE_API_TOKEN`        | Existing replacement token; never paste into source, commands or chat       | Already saved by owner; workflow references it only in final publish step |
| Variable `CLOUDFLARE_ACCOUNT_ID`     | Actual intended Cloudflare Account ID, 32 hexadecimal characters, not zeros | Cloudflare account overview                                               |
| Variable `CLOUDFLARE_D1_DATABASE_ID` | Actual UUID for existing `happy-fatun`, not zeros                           | Workers & Pages → D1 → `happy-fatun` database details                     |

Both identifiers are **non-secret variables**, not API tokens. Repository variables work; environment-scoped variables work in the gated deploy job too. Avoid conflicting repository/environment values (environment values take precedence). No Worker-name, DB-name, branch, email, R2, `CLOUDFLARE_ENV` or custom-domain variable is needed: targets are fixed and reviewed. Account/D1 identifiers must agree with any non-placeholder values already in the source config; mismatch fails before writing. The existing deployment wrapper also rejects inherited account/D1 selectors that differ from the prepared config immediately before Wrangler, so a later variable change cannot redirect publication. The script fills only those identifiers in `wrangler.preview.jsonc` in the ephemeral runner checkout; nothing is committed back.

At inspection, this repository was **public** and had **no GitHub environments**. Listing repository variables returned 403 for the current integration, so their presence/values are not claimed. No secret lookup was attempted.

## Configure the separate approval gate

Create the exact environment **`cloudflare-preview`** in repository Settings → Environments before any future dispatch:

1. Add at least one **required reviewer** with repository access. A missing/unprotected environment is rejected by the verification script; the workflow does not rely on GitHub automatically creating an environment.
2. Restrict deployment branches/tags to the **branch** `feat/furniture-platform` only; do not add a tag/main wildcard. The code also enforces that exact branch and repository.
3. Disable administrator bypass of protection rules. Enable **Prevent self-review** when a second reviewer is available; it requires someone other than the initiator. For a sole owner, leaving self-review allowed still requires the separate explicit environment review action, but is not independent two-person review. Reviewers must inspect the pinned SHA, changes, target IDs, verification results and schema/backup readiness before approval.
4. Optionally move the existing repository token to an environment secret of the same name for stronger containment; never expose its value. This is not required by the workflow and was not performed here. Keep identifiers as variables, not application authentication secrets.

Current GitHub documentation says required reviewers are available on **public** repositories with GitHub Free/Pro/Team. GitHub Free private repositories cannot enforce this desired environment gate; Pro/Team private environments also do not provide required reviewers under the cited availability rules. Do not silently replace approval with an unprotected environment, a timer, a checkbox or an automatic deployment. This workflow deliberately blocks private visibility; if visibility/plan changes, review the design or use the separately approved operator CLI procedure. No paid upgrade is part of this task.

References: [managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [required reviewers / plan availability](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers). Checked against GitHub's official docs source during implementation; plan capabilities can change.

## Workflow behavior and commit selection

`.github/workflows/cloudflare-preview.yml` has **only `workflow_dispatch`**. Push/PR CI continues to test/build/dry-run and cannot invoke publishing. The new workflow never applies remote migrations, exports customer data, creates D1/R2, installs Worker secrets or runs a payment service.

GitHub requires a dispatch workflow to exist on the **default branch** before it becomes available for manual dispatch. This repository's default is `main`; the new file is prepared on PR #2's feature branch. **No merge/default-branch change was performed.** The owner must separately approve making the reviewed workflow available on the default branch. Keep the feature branch available: choosing default `main`, a tag, a fork or another branch is blocked/skipped, never a fallback. A future change of deploy branch must be an explicit reviewed code change.

After all prerequisites and separate deployment approval, select **Manual Cloudflare preview → Run workflow → branch `feat/furniture-platform`**, then enter its exact reviewed **40-character commit SHA** as `reviewed_commit`. An advanced operator can later use:

```sh
gh workflow run cloudflare-preview.yml --repo Vishnu063/Happy_Fatun --ref feat/furniture-platform -f reviewed_commit=FULL_REVIEWED_40_CHARACTER_SHA
```

Do **not** run that command now. Replace the SHA placeholder with the owner-reviewed commit only after approval; never use a mutable branch name as the input. If the branch changes before dispatch, the mismatch fails. Both jobs check out `${{ github.sha }}`, so branch movement after dispatch cannot replace the reviewed code.

The `verify` job checks exact event/repository/branch/SHA and reads GitHub environment rules without a Cloudflare token. It runs checksum-pinned actionlint, Node 24, `npm ci`, formatting, preview guard, build, all automated tests, dependency audit, non-publishing preview dry-run and both desktop/mobile browser suites. Then the **separate `deploy` job waits on GitHub environment approval**. It checks the dispatch/environment rules again, installs from lockfile, injects/validates real IDs, builds and dry-runs the actual target, then runs the existing guarded `node scripts/deploy.mjs --preview`. Cloudflare credentials are present only for that last step. Jobs have read-only contents/actions permissions; checkout credentials are not persisted, checkout v7.0.1 and setup-node v7.1.0 are pinned to verified release commits (both Node 24 action runtimes), concurrent deployment runs are serialized without cancelling an active deployment, and no input is interpolated into shell code.

GitHub approval checks read configuration; they do not grant approval themselves or validate Cloudflare ownership. Missing GitHub API permission, a 403/404/outage, private visibility, missing reviewers, invalid/missing/zero IDs, target mismatch, missing deployment token or failed checks stops the workflow. An approved run publishes/updates `aaranya-living-preview`; review any existing Worker with that name before approval. Do not dispatch merely to test syntax.

## Cloudflare and D1 prerequisites (separate approval required)

Use the [full no-R2 operator runbook](FREE_PREVIEW_DEPLOYMENT.md) to review the intended account, Free plan/usage, workers.dev subdomain, existing Worker and D1 schema/history. Keep the replacement token restricted to the intended account and permissions needed for Worker/static-assets deployment and its D1 binding; no R2, DNS/zone administration or broad account credentials are requested. Actual token authorization/binding permissions remain unverified. Stop and review a permission error rather than broadening access or activating paid services.

**Deployment does not apply schema.** Before a future deployment, inspect pending migrations and privately back up the selected existing database. After explicit authorization, the separate operator command is:

```sh
npx wrangler d1 migrations apply happy-fatun --remote --config wrangler.preview.jsonc
```

For that separate local CLI operation, the operator must privately authenticate with the intended restricted credentials and set the reviewed actual IDs in the local config as described in the runbook; GitHub variables are not automatically local CLI configuration. Never reset/reseed an existing database to bypass migration history. Review the backup/restoration procedure first; backups may contain customer PII and must not be uploaded as public CI artifacts. The workflow grants no migration approval and never runs this command.

The deployment API token is **not** the application login/session configuration. Required Worker secrets `OWNER_PASSWORD_HASH` and `SESSION_SECRET` must be installed privately through the existing runbook after explicit approval; this workflow deliberately does not manage them or request additional GitHub secrets for them. Without them, quotation submission and owner login fail closed. Email stays disabled, preview remains noindex, and R2-dependent actions remain unavailable. Real quota/CPU behavior, live DB compatibility and actual workers.dev operation require separately approved live smoke checks before sharing.

## Verification and limitations

`bash scripts/lint-workflows.sh` validates workflow YAML, expressions and action input syntax with actionlint **1.7.12**, fetched from a pinned release and checked against SHA-256 before execution. It disables the optional external ShellCheck integration; it is not a claim of a separate ShellCheck run. The same lint runs in normal CI and manual verification. No npm/runtime dependency was added.

`tests/manual-deployment.test.ts` covers exact SHA/ref/event restrictions, missing/zero/malformed IDs, target drift, preservation of the template, forbidden R2/email changes, missing reviewers/private visibility, missing GitHub read auth, denied/malformed API responses, token-free verification, and real config-helper execution in a disposable local directory. A forged reviewer/API response is not an actual GitHub approval; tests use isolated fixtures. The manual workflow itself was **not dispatched** and the real token, Cloudflare target, environment approval and publication are **not live-verified**. Validation results are recorded in VALIDATION.md and PR #2.
