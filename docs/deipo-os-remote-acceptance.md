# Sprint 04D — Remote acceptance and founder checklist

Checkpoint: 2026-10-10 Guatemala / 2026-10-11 UTC; post-SMTP verification. **NO-GO: remote acceptance remains incomplete.**
This report separates observed remote facts, earlier provider/fixture evidence and pending human checks. It does not authorize Production activation or merging PR5.

## Verified target and boundaries

- Branch `feat/deipo-os-sprint-04-operations`; local and PR5 HEAD `f03a10de708e4e32e8ba8ee44675fbb0fede7956`.
- PR5 remains open, Draft, unmerged; base main `67099f7d847764941412900296cb938c88c989a0`.
- Preview5: `https://deploy-preview-5--deipo.netlify.app`; deploy `6ac84bea75ca4100086d0bb2`, READY, deploy-preview context and exact HEAD.
- Acceptance: **deipo-os-acceptance**, `zyixizuutoyccouuijjz`, ACTIVE_HEALTHY. Migration history contains 001–027, 28 records because historical 005 has two migrations. No migration applied during this unblock attempt.
- Acceptance Auth users: **0**; admin profiles: **0**. Synthetic DROP9004 remains draft, online ordering false.
- No product changes, Auth creation, invitations or payments performed yet. Preview-only env and acceptance Auth redirect changes are recorded below; Production remains untouched.

## Remote acceptance results

| Item | Result | Evidence or blocker |
| --- | --- | --- |
| Preview environment readiness | PARTIAL / REBUILD READY | Dashboard access restored. Staff/commerce origins, encryption key, payment origin/methods configured only for Deploy Previews. WhatsApp PENDING BUSINESS NUMBER; not a blocker for other acceptance. |
| Acceptance server credentials | EXISTING PREVIEW SECRET; RUNTIME VALIDATION PENDING | Dashboard confirms Supabase URL is acceptance; existing secret is Preview-only, Production empty. No key revealed/replaced; successful Auth service call still required to validate correspondence. |
| Staff invitation creation through founder UI | NOT RUN | Controlled emails supplied privately; Auth/Admin/Operator counts remain zero. SMTP and URLs verified; founder password/create-user handoff pending. |
| Invite email delivery | NOT RUN | Requires actual invited mailbox delivery evidence, distinct from an Auth API success. |
| `/ops/accept`, password/session, role redirects | NOT RUN | Requires real invitations and controlled accounts. Human completes password entry/submission. |
| Inactive staff rejection and role PII boundaries | NOT REMOTELY VALIDATED | Local SQL/browser evidence remains historical; it does not establish remote role acceptance. |
| Previous driver denied after reassignment | NOT RUN | Needs a second controlled Driver or explicitly authorized temporary role reuse. Test the old session immediately after reassignment. |
| `/admin/login` zero-cookie regression | HTTP PASS NOW; PRIOR BROWSER SMOKE PASS | Fresh HTTP requests without Cookie: login200 with password form/no Netlify error, protected `/admin`307→login, `/ops/login`200. Rechecked after rebuild6ac92d98 at18:10UTC: same PASS; see `evidence/sprint-04d/remote-auth-http-smoke-rebuild.json` (earlier run preserved). Prior browser rendering evidence is `preview-smoke.json`; this HTTP check does not replace authenticated staff acceptance. |
| Web card E2E | NOT RUN | No new Preview5 storefront → checkout → verified payment → receipt/tracker/QR → Ops chain. |
| WhatsApp-assisted E2E | PENDING BUSINESS NUMBER | No authorized business number. Leave NEXT_PUBLIC_SALES_WHATSAPP_NUMBER empty; no fabricated CTA. Does not block Auth, payments, Ops or other release acceptance. Internal Assisted Sales may be tested without sending WhatsApp. |
| Transfer checkout methods and memo | PROVIDER-CONFIRMED, PRIOR 04D EVIDENCE | 2026-10-08 20:33:58 UTC: HTTP201, exact `card` + `bank_transfer`, expected memo match, `live_mode=false`; Sandbox identity verified through `/test`. |
| Bank-transfer settlement | **NOT PROVIDER-VALIDATED** | No settled transfer observed. Checkout creation is not payment success. |
| Signed webhook/browser cases | **FIXTURE-CONFIRMED, LOCAL ONLY** | Prior signed fixtures validate internal post-webhook behavior; no provider settlement or new remote fixture run. The separate local 80-unit rehearsal used consumer RPCs directly, not signed provider webhooks. |

Prior provider evidence: `evidence/sprint-04d/provider-methods.json`. Prior regression and rehearsal details: `deipo-os-sprint-04.md`, Sprint04D appendix. Sprint03 successful card payment is historical and cannot pass the new Sprint04D journey.

### Preview-only configuration to verify and apply after dashboard access

| Variable | Required acceptance value or handling | Current verification |
| --- | --- | --- |
| `STAFF_INVITE_ORIGIN` | Exact Preview5 HTTPS origin above | Saved only in Deploy Previews; Production/other contexts empty |
| `CUSTOMER_COMMERCE_ORIGIN` | Exact Preview5 HTTPS origin above | Saved only in Deploy Previews; Production/other contexts empty |
| `CUSTOMER_ACCESS_ENCRYPTION_KEY` | New dedicated 32-byte random key, 64 lowercase hex | Saved as secret only in Deploy Previews; Builds/Functions/Runtime, no Post processing; no plaintext printed or saved locally |
| `NEXT_PUBLIC_SALES_WHATSAPP_NUMBER` | Leave empty until authorized business number exists | No number configured by this session; no write |
| Supabase URL, public key and `SUPABASE_SECRET_KEY` | All must belong to `zyixizuutoyccouuijjz`; secret restricted to server/runtime | Preview URL verified exact; existing secret Preview-only. Public-key/secret correspondence still awaits runtime Auth verification |

Inspect existing scopes before saving. Use Preview5/acceptance values only, never all-context or Production-scoped overrides. Verify exact Auth redirect `/ops/accept`, invite email support and invitation-only policy in acceptance. Existing Sandbox payment origin, method configuration and webhook routing must be verified without configuring LIVE. A Preview rebuild is required for public build-time variables; verify the resulting deploy SHA and runtime before starting journeys.

## Netlify token-log review

| Available project log surface | Full path visible | Retention/control options verified in this account | Launch risk acceptable |
| --- | --- | --- | --- |
| Function logs | NO, in inspected sample | UI states 24-hour retention; Last day/real-time/search/copy available. No path-redaction control exposed | Insufficient for platform-wide acceptance |
| Edge logs | UNKNOWN | Exact Preview deploy selected; Last day displays Waiting for logs. No sample/retention guarantee established | No acceptance evidence |
| Request/access logs or drains | UNKNOWN | Project UI offers Enterprise Log Drains/contact sales; observability search/history requires plan change. No raw request records or path-redaction setting available in inspected account UI | No acceptance evidence |

Two unissued synthetic canaries were requested at 2026-10-09 02:16 UTC; no real capability was created. Both returned HTTP200 with private/no-store and no-referrer. Sanitized request IDs and hashes are in `evidence/sprint-04d/remote-preflight.json`. These headers do **not** prove infrastructure-log redaction. Function retention is now verified at24h; platform request retention, log-reader scope and path-level redaction remain unverified. No plan upgrade or drain change was performed. No raw capability appears in this report.

After access, correlate the request IDs on each actual surface and report only YES/NO/UNKNOWN for full-path visibility. If a surface retains raw capability paths without reasonable redaction, **STOP** before further bearer-link acceptance. Proposed smallest change for approval: put capability in a URL fragment, exchange it through a same-origin POST into a scoped HttpOnly session, clear the fragment and serve fixed `/buy` or `/order` paths. Also verify POST-body logging and revocation/expiry. This proposal has not been implemented or assumed necessary from unavailable logs.

## Founder manual checklist

All items below are **PENDING HUMAN EVIDENCE**. For each, record tester, local date/time, Preview deploy, device/OS or printer/paper settings, expected/actual result and a sanitized evidence reference. Use controlled acceptance data only; do not capture tokens, addresses, passwords or card details in evidence.

### iPhone Safari

- [ ] Storefront loads correctly and opens checkout; pickup and delivery selections match the test order.
- [ ] Allow geolocation: pin and correction work; record expected location behavior.
- [ ] Deny geolocation: manual pin/fallback completes without trapping checkout.
- [ ] Recurrente Sandbox redirect and return preserve the correct order; verified payment reaches receipt.
- [ ] Tracker and QR display legibly; expiration/revocation gives the expected denial.
- [ ] `/ops/login` and invitation acceptance work; Kitchen, Fulfillment and Driver reach their correct views.
- [ ] Kitchen exposes no customer PII; Fulfillment only required logistics; Driver only assigned delivery.
- [ ] Inactive account is rejected; the old Driver session loses the delivery immediately after reassignment.

### Physical printing and scanning

- [ ] Print packing label; verify quantities, components, seal workflow and absence of contact/address PII.
- [ ] Print pickup label; verify order code and pickup identification without unnecessary logistics.
- [ ] Print delivery label from an authorized role; verify required logistics only.
- [ ] Repeat layouts on A4 and actual thermal paper; record paper width, scaling, clipping and contrast.
- [ ] Scan QR from screen and from printed paper; confirm correct order and authorized behavior.
- [ ] Complete the order-code fallback when QR scanning fails; code alone must not grant access.

### Timed operational rehearsal

- [ ] Prepare realistic acceptance orders across pickup/delivery, quantities and time slots; record expected totals.
- [ ] Record kitchen-wave start/end, preparation and handoff times with actual operators.
- [ ] Pack using component checklist and security seal; record discrepancies.
- [ ] Complete pickup handoffs and assigned-driver delivery, including reassignment.
- [ ] Exercise an issue and a no-show; record resolution without implying refund or inventory release.
- [ ] Close operations; reconcile every paid order, completed/cancelled/unresolved totals and close snapshot.
- [ ] Calculate on-time rate from actual timestamps and document the denominator; do not reuse accelerated fixture timing.

## Production unchanged evidence and disposition

Read-only recheck on 2026-10-09:

- Project `qntjxfmwblhetpsmzzhm`: 19 migration records (001–018 baseline), orders0, ordering-enabled drops0, CURRENT/NEXT null, hold TTL600.
- Same drop fingerprint `056d3ea1d4fc18e228759510e1f67d9d`, using `md5(string_agg(to_jsonb(d)::text,'' order by id))`.
- Published Production Netlify deploy remains `6abddcecea4c8a000840c3cb`; PR5 remains Draft/unmerged against main67099f7.
- No Production env write or other remote mutation was performed. Production env values were not read or hashed, so this is an action-boundary statement, not an independent env audit.

**NO-GO.** Preview configuration, staff Auth/email, both new remote payment journeys, actual log review and physical/timed human checks remain open. Dashboard sessions and controlled emails are now supplied. Current next action: founder Auth bootstrap with human password entry, followed by staff invitations through the application. SMTP is enabled and URLs verified; delivery remains untested. WhatsApp is PENDING BUSINESS NUMBER and does not block other acceptance. No merge, Production activation, cleanup or Sprint05.


## Historical 2026-10-09 configuration follow-through (Auth settings superseded below)

- Netlify Preview `NEXT_PUBLIC_SUPABASE_URL` equals `https://zyixizuutoyccouuijjz.supabase.co`. Existing server secret already has a Deploy Previews value and no Production value; never read/replaced its plaintext.
- Created Preview-only `STAFF_INVITE_ORIGIN`, `CUSTOMER_COMMERCE_ORIGIN` and secret `CUSTOMER_ACCESS_ENCRYPTION_KEY` as above.
- Corrected Preview-only `PAYMENT_ALLOWED_ORIGIN` from the obsolete Preview4 origin to the exact Preview5 origin. No wildcard or Production value was introduced.
- Added Preview-only `NEXT_PUBLIC_PAYMENT_METHODS=CARD_AND_BANK_TRANSFER` and matching `PAYMENT_ACCEPTANCE_CONFIRMED`, based on the previously provider-confirmed creation/method/memo contract. These settings do not assert settlement success or launch approval.
- Acceptance Auth now allowlists exactly `https://deploy-preview-5--deipo.netlify.app/ops/accept`. Site URL remains `http://localhost:3000`: changing its default callback was rejected by automatic approval review, so explicit confirmation was requested; no alternate mechanism was used to apply that rejected change.
- Custom SMTP is disabled. [Supabase documents](https://supabase.com/docs/guides/auth/auth-smtp) that default SMTP sends only to organization-member addresses; delivery to supplied staff addresses is not established. No organization membership expanded as a workaround. SMTP credentials were requested through the dashboard, never chat.
- Acceptance recheck still reports Auth0/Admin0/migrations28. No users or roles have been fabricated by SQL.
- Preview-only rebuild requested through Retry on PR5, after checking Draft=true, merged=false and exact head f03a10d. New deploy `6ac92d98a545c34b52d20db3` verified READY, deploy-preview context, exact f03a10de708e4e32e8ba8ee44675fbb0fede7956. Production published main remains67099f7.
- Function Last day logs contain duration/memory/config timing lines and no raw buy/order paths in the inspected sample; this is a scoped NO, not proof of absence in infrastructure access logs. Edge logs were inspected through the exact deploy link and returned Waiting for logs. Deploy activity shows anonymous browser visits without paths. Drains and expanded observability are plan-gated; no upgrade performed.

Post-rebuild Production database fingerprint, migration count and ordering/order counts remain unchanged. No application code, commit or push was added in this follow-through.


## 2026-10-10 — Post-SMTP verification and exact human handoff

- Live dashboard identity: **deipo-os-acceptance / zyixizuutoyccouuijjz**. Saved Site URL exactly `https://deploy-preview-5--deipo.netlify.app`; sole redirect exactly `https://deploy-preview-5--deipo.netlify.app/ops/accept`.
- Custom SMTP verified enabled after dashboard reload; credential fields were not read or printed. This proves configuration enabled, not email delivery.
- **Discrepancy repaired:** Allow new users to sign up was ON. Turned OFF, saved and reloaded; persisted OFF. Anonymous sign-in and manual linking OFF; email confirmation ON. No Production Auth change.
- Read-only acceptance counts: Auth0/Admin0/Operator0. No founder exists to issue invitations through the application. Prepared the founder Create new user form in acceptance, with controlled founder email and no password. Human must enter a password and submit. Auto-confirm founder bootstrap does not establish staff email delivery. Founder profile bootstrap and Preview sign-in remain pending after Auth creation.
- Staff invite delivery, /ops/accept, passwords/sessions/role redirects, inactive rejection, role PII and old-driver denial remain **NOT RUN remotely**. Controlled staff emails remain private in Wichiss. Driver reassignment still needs a second controlled identity or approved temporary test-role reuse.
- Card E2E, receipt/tracker/QR and Ops fulfillment remain **NOT RUN**. No new payment or redirect was accepted as success. Provider methods/memo and fixture-only transfer behavior retain their prior labels; settlement remains NOT PROVIDER-VALIDATED.
- **WHATSAPP ASSISTED REMOTE E2E = PENDING BUSINESS NUMBER.** No personal/placeholder number or CTA. This pending business dependency does not block other Auth/payment/Ops/release acceptance; internal Assisted Sales can proceed after founder access.
- iPhone Safari, physical print/QR, timed rehearsal and capability-log controls remain pending as listed above.
- Production read-only evidence refreshed: orders0, migrations19, unchanged drop fingerprint `056d3ea1d4fc18e228759510e1f67d9d`; Netlify published deploy remains `6abddcecea4c8a000840c3cb`. No Production mutations or independent env-value audit.
- PR5 rechecked OPEN/DRAFT/unmerged, exact head f03a10d/base67099f7. No application code, commit, push, deploy, merge or Sprint05 work. **NO-GO: acceptance incomplete**, unrelated to missing WhatsApp number.

Sanitized evidence: `evidence/sprint-04d/remote-post-smtp-preflight.json`.

### Founder Auth handoff follow-up

Founder reports manual creation completed. Read-only lookup confirms the controlled founder Auth account exists with email_confirmed=true and no admin profile. The narrowly scoped acceptance-only founder bootstrap INSERT was rejected by automatic approval review because this persistent role grant requires explicit authorization. No profile was inserted. Next action: obtain approval for that exact account and founder role in acceptance; then Preview sign-in and staff invitations. Earlier Auth0 counts describe the pre-creation snapshot. No staff invitation, payment or Production mutation occurred.

### Founder role authorized and applied

Founder explicitly authorized the exact acceptance account/role grant. Scoped INSERT returned role=founder and is_active=true for the confirmed founder Auth identity, only in zyixizuutoyccouuijjz. This resolves the preceding approval blocker; no operator profile was promoted. Preview5 /admin/login renders correctly on deploy6ac92d98 with controlled founder email prepared. Human sign-in is pending because the password remains user-controlled. Authenticated Admin, staff invite delivery and role acceptance are not yet claimed. No Production changes.

### Authenticated founder and first real staff invitation

- Founder real sign-in verified at Preview5 /admin, rendered ADMIN / FOUNDER; direct staff page reload preserved authorization.
- Kitchen invitation submitted through /admin/operations/staff with Cocina role and active access. Application reports account prepared, active, invitation pending. Read-only acceptance query confirms Auth2/Operator1 and Kitchen invited_at present, last_sign_in_at absent. This proves invitation creation, **not actual delivery or role acceptance**.
- Fulfillment form prepared, but submission rejected by automatic approval review because recipient authorization could not be established from trusted user instructions. No bypass/retry; explicit confirmation requested for Fulfillment and Driver recipients. Read-only check confirms neither account exists. Driver invitation not sent.
- Human must check Kitchen mailbox (including spam), open invitation separately from founder session, complete /ops/accept password confirmation and report resulting route. Do not share credentials or invitation tokens.
- Card/tracker/QR/Ops, inactive/PII/reassignment and physical/timed checks remain pending. WhatsApp PENDING BUSINESS NUMBER remains independent. No Production mutation, merge, deploy or code change.

### Replacement controlled recipients authorized

Founder supplied three replacement Gmail identities because business mailboxes are not available. These supersede all prior staff destinations; exact addresses stay in the private vault.

- Replacement Kitchen already existed on resumption with kitchen role/active access but an incorrect Fulfillment display name. Corrected display name through the application; did not duplicate or resend the existing invitation.
- Previous unavailable Kitchen access deactivated through application with audit reason; Auth/history retained. This state change does not itself pass an authenticated inactive-account denial test.
- Replacement Fulfillment and Driver invitations submitted successfully through founder application. UI reports active/invitation pending. Read-only DB confirms all three current roles correct, active and invited; previous Kitchen inactive.
- Fulfillment has an Auth sign-in timestamp; Kitchen and Driver do not at this check. This alone does not establish human mailbox delivery, completed password setup, role redirect or privacy acceptance. Human confirmation remains pending for all three.
- Previous recipient approval blocker resolved by explicit replacement addresses from founder; no blocked action bypassed. Production untouched; no code/merge/deploy. WhatsApp PENDING BUSINESS NUMBER remains independent.

## 2026-10-11 — Invite branding and Packaging / Ready polish

- Acceptance-only Invite user subject/body saved and verified after reload against `supabase/templates/invite.html`: exact match, one unchanged `{{ .ConfirmationURL }}` CTA. Subject: Tu acceso está listo. — DEIPO OS. Cream/black/orange, official PNG wordmark, lightweight inline/table HTML, requested copy and footer. Plain-text fallback delivered as `invite.txt`; not represented as a remotely configured MIME part. Sender remains deipo.; recommendation DEIPO OS. SMTP credentials not inspected. Actual branded-email delivery/rendering remains pending.
- Local visual-only changes in `src/components/ops/console.tsx` and `src/app/ops/ops.css`: scoped fulfillment hierarchy/spacing, ruled three-column KPI strip with larger tabular numbers, mobile drop-select truncation, comfortable sync button, inline labeled result/error block and clearer existing-order microcopy. Calculations, permissions, API actions, data flow and backend unchanged.
- Validation: lint and typecheck pass; optimized QA production build passes; 47 general unit tests and 19 operations tests pass; isolated local DB fixture 158 checks/7 races passes; six operations browser tests pass. Initial general suite on unsupported Node20 had two proxy failures; direct required Node22 rerun passes47/47 with no code changes. Manual local fixture widths320/390 have no horizontal overflow, select ellipsis, sync button52px. These are LOCAL FIXTURE results, not remote role/PII/fulfillment acceptance.
- Staff: all three controlled current roles active/invited; only Fulfillment has a sign-in timestamp at latest read. Mailbox delivery, password completion and correct role redirect are not inferred from timestamps. Human acceptance remains required; authenticated inactive/PII/reassignment checks remain pending.
- Card remote E2E/receipt/tracker/QR/Ops fulfillment remain NOT RUN in this continuation. Provider-confirmed card + bank_transfer creation and expected memo retained; bank-transfer settlement remains NOT PROVIDER-VALIDATED. iPhone Safari, physical print/QR and timed rehearsal remain pending.
- WHATSAPP ASSISTED REMOTE E2E = PENDING BUSINESS NUMBER. No number/CTA configured, no message sent; independent acceptance tracks remain unblocked by this business dependency.
- No commit, push, Preview deployment, merge, Production mutation or Sprint05. UI polish is local only; PR5 remains Draft at prior remote checkpoint. Last observed Production fingerprint/deploy evidence above remains the baseline, not a new infrastructure-wide audit. Release remains NO-GO because remote acceptance is incomplete.


## 2026-10-11 — Checkpoint polish detenido antes de commit

La nueva ejecución requerida por el founder se detuvo conforme a «If anything fails: STOP». Node22: lint, typecheck, unit47/47, operations19/19 y build de producción PASS. Browser operations04B:3 PASS/3 FAIL. Kitchen no encontró «80 unidades activas»; Kitchen bulk y Driver lifecycle recibieron HTTP400 donde esperaban200. Causa todavía no diagnosticada; no asumir regresión de UI ni atribuirlo al fixture sin evidencia. Este resultado actual supersede el PASS histórico para autorizar este checkpoint.

Sin commit/push ni refresh Preview. HEAD local/remoto f03a10de708e4e32e8ba8ee44675fbb0fede7956; main67099f7d847764941412900296cb938c88c989a0. PR5 OPEN/DRAFT/unmerged y Production deploy6abddcecea4c8a000840c3cb verificados. Código modificado solo ops.css/console.tsx; docs/evidence/templates sin trackear. Migraciones sin diff contra HEAD; no env/secret editado ni staged. Secret scan final y smoke de nuevo Preview no ejecutados por STOP. Log local /private/tmp/deipo-checkpoint-build-browser.log.


## 2026-10-12 — Browser failure diagnosis resolved locally (no checkpoint)

**Root cause: reused SQL fixture; polish caused it: NO.** Baseline f03a10d and current polish each pass all six tests on separate empty PostgreSQL17.6 databases, migrated001–027 and seeded with the exact04B script. Node22.22.1 used for every comparison. Repeating the current suite on its now-consumed diagnostic fixture reproduces exactly3 PASS/3 FAIL. The HTTP /reset resets in-memory state only; it does not reset PostgreSQL. This supersedes the unresolved diagnosis in the preceding entry.

| Test | Baseline fresh | Polish fresh | Polish consumed | Fixed runner, two invocations |
| --- | --- | --- | --- | --- |
| Inactive login | PASS | PASS | PASS | PASS / PASS |
| Kitchen80/privacy/mobile | PASS | PASS | FAIL | PASS / PASS |
| Kitchen bulk | PASS | PASS | FAIL | PASS / PASS |
| Packing checklist/pickup | PASS | PASS | PASS | PASS / PASS |
| Driver lifecycle | PASS | PASS | FAIL | PASS / PASS |
| Founder sync/staff | PASS | PASS | PASS | PASS / PASS |

The prior successful Packing and Driver tests completed two2-unit orders. The next run therefore correctly rendered76 active units out of40 orders/80 total units. Same Kitchen summary selector and selected04B fixture; not a DOM, timing, role projection or different-drop defect.

Both HTTP400s were POST /api/ops with the generic body: `{ "error": "No se pudo guardar. Revisá el estado, los datos y tus permisos; actualizá antes de reintentar." }`. Kitchen bulk used founder and `transition`, version9, to queued, override true, reason Local UI bulk verification, on a completed pickup. SQL private.ops_transition rejects terminal states before overrides (022 line132). Driver setup used fulfillment and `check`, version8, component bag, quantity2, on a completed assigned delivery. private.ops_pack_check passed version validation; private.ops_check_packing rejects any status other than in_prep (020 line130). Both throw P0001 / OPS_INVALID_TRANSITION. Request versions matched stored versions; orders remained paid; wave started and not completed; driver active and assignment retained. These are correct product guards, not backend defects.

Small harness correction only: scripts/test-admin.mjs now creates a uniquely named empty loopback database for explicit operations-04b.spec.ts runs, applies unchanged migrations and the existing04B seed, then drops only that generated DB in finally. It requires Node22+ and a local PostgreSQL login capable of CREATE DATABASE. The provided database is not mutated. Generic other suite behavior and test assertions are unchanged.

Validation after correction: two consecutive invocations6/6 each, unit47/47, operations19/19, fixture158 checks/7 races each, lint/typecheck/optimized production build Node22/diff-check PASS. Input fixture fingerprint unchanged, zero runner scratch databases remain. All28 migration files001–027 byte-identical to baseline; original polish diff unchanged. Local PG extension files missing from the temporary runtime were restored from the matching17.6 npm package before empty-DB reproduction; not a cause of the original browser failures.

Sanitized payloads, pre-action DB snapshots, SQL errors and comparison: evidence/sprint-04d/operations-browser-diagnosis.json. Full local diagnostic logs/traces: /private/tmp/deipo-diagnosis/. **SAFE TO CHECKPOINT for this local failure gate; no commit/push/deploy performed.** Remote/human acceptance still NO-GO; Production untouched; WhatsApp PENDING BUSINESS NUMBER remains independent.
