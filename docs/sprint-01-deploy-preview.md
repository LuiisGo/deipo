# Sprint 01 — controlled Deploy Preview acceptance

Readiness review: 2026-09-20. Branch: `feat/deipo-os-sprint-01`. Starting HEAD was still `319af3a369c420811a215ad8aba3caab50f19eb5`, with a clean tree. This review adds HTTPS cookie handling, session regression coverage and this handoff. No push, merge, deploy, remote data mutation or Sprint 02 work was performed.

## Existing Netlify site

Verified through the connector and the owner-authenticated dashboard:

- Site `deipo`, ID `e7627e10-c876-492b-9b43-61a8a6c9ebfa`, repository `LuiisGo/deipo`.
- Production branch `main`; branch deploys disabled for other branches; Deploy Previews enabled for PRs targeting production/branch-deploy branches.
- Build active, base `/`, command `npm run build`, publish `.next`, Next.js detected. Existing production remains `18bcedd`, deploy `6aab18e39a3bca000879298b`.
- No project environment variables configured. Untrusted fork previews require approval.
- Dashboard Node selection is 24.x; existing `netlify.toml` sets `NODE_VERSION=22`, which overrides that selection. No runtime override is needed. The adapter is not pinned in the repository; verify the adapter version and Node 22 in the first preview's build log.

A branch push alone will create **no Netlify deploy** with these settings. Opening a PR from this branch to `main` creates `https://deploy-preview-<PR-number>--deipo.netlify.app`. If that PR already exists, pushing updates it. This is the existing site's preview, not a new site. See [Netlify Deploy Previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/) and [Node selection precedence](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

## Environment checklist

Configure the existing site's **Deploy Previews** context before its first build. Configure **Production** with the same requirements before merging. Use Builds and Functions scopes (or all scopes if the plan does not expose granular scopes). Values are deliberately omitted here.

| Name | Requirement |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required; existing `deipo-os` project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required; matching project's publishable key. Never use a service-role key. |
| `NEXT_PUBLIC_SITE_MODE` | Explicitly set `production` for controlled acceptance in both contexts. Missing/invalid values already fail closed to production in production builds. Do not select preview fixtures for this acceptance. |
| `NEXT_PUBLIC_SITE_URL` | Optional metadata origin. Production: canonical HTTPS origin; preview: exact preview origin if desired, otherwise leave unset. It does not control sign-in or cookie scope. |

`NODE_VERSION=22` is already supplied by `netlify.toml`. `DEIPO_BUILD_DIR` is a local test facility and must remain unset on Netlify. Analytics identifiers are dormant and not required. There is no application requirement for a database password, service-role key, `NEXTAUTH_SECRET`, or additional auth secret. `.env.example` documents every required name. Public Next variables are baked into the build: changing them requires a new build. See [framework environment scopes](https://docs.netlify.com/build/frameworks/use-environment-variables-with-frameworks/).

## Auth acceptance

Cookies are host-only, `SameSite=Lax`, and `Secure` outside local HTTP development. Browser, server and Proxy use the same policy, so the production host and each preview do not share a session. Supabase's browser client requires access to auth cookies for Storage and refresh, so its supported non-HttpOnly behavior is retained. Protected pages use fresh `getUser` identity validation plus active `admin_profiles` membership; actions enforce writer roles and RLS remains unchanged.

Proxy forwards the SSR library's cache headers and always marks Admin responses private/no-store, no-cache, expired. The production Next runtime was tested against the isolated auth backend for founder login/reload/logout, authenticated non-admin rejection, a profile deactivated after login, expired access-token refresh, revoked refresh-token denial, and HTTPS-forwarded Secure cookie/cache headers. Real TLS/CDN and Netlify adapter behavior still require the actual Deploy Preview. No custom OAuth/callback redirect configuration is required for the implemented email/password flow. See [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Manual Supabase action: enable [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) if available on the project's plan. It is still disabled and is the only security-advisor finding. Do not loosen RLS or create a new project to address it.

## Storage, migrations and data

- Live `drop-assets`: public, 15 MB, JPEG/PNG/WebP/AVIF. Storage write/update/delete policies require an active founder/admin; metadata reads require active admin membership.
- One existing owner-entered hero has a physical object, a `drop_media` record and a matching `drops.hero_image_path`. It decodes successfully through Next Image in the authenticated preview. The supported rendering path is browser upload → Storage → media metadata → transactional hero trigger → authenticated preview → allowlisted customer DTO/public Storage URL.
- Public URLs are accessible independently of draft-record permissions. Customer-safe rendering means whitelisted data and controlled publication, not private asset URLs.
- CURRENT and NEXT remain null; the public RPC exposes neither the cancelled drop nor its internal data. No drop was created/published/assigned to test rendering during this review.
- Zero orphan objects, zero missing-object media references and zero QA-prefixed Storage paths were observed. No technical QA upload or cleanup was needed.
- The database is **not certified free of QA business data**: after the prior empty-database report, an owner-entered cancelled drop and one sale appeared. Their provenance must be confirmed and any cleanup explicitly scoped; nothing was deleted or reclassified by the agent.
- All nine local migration filenames/versions/names and SQL statements match remote history, including 007/008 (trailing whitespace normalized). No local extras, missing versions or historical SQL drift. The live inventory view remains `security_invoker=true`; the active-admin helper still checks `auth.uid()` and `is_active`. A read-only authenticated non-admin probe sees zero drops, inventory, sales and media. No migrations or RLS changes were needed.

The uploader remains available in the editor's **MEDIA Y PACKAGING** section: select an approved real asset, choose Hero/Packaging/Gallery, enter meaningful alt text, then **Subir asset**. Confirm **Asset guardado**, the hero reference when applicable, and **Preview autenticado**. Definitive DEIPO asset approval is still a human acceptance item. Do not create another production drop merely for QA.

## Verification

Readiness changes passed lint, strict typecheck, 28 unit tests, production builds, all 42 storefront/anonymous Admin browser tests and seven isolated Admin browser tests. Automated WCAG checks cover login, mobile editor and the existing storefront journeys. Build/auth/final browser validation uses Node 24.19.0. The general browser runner now starts a fresh server using the invoking Node executable, avoiding a stale server or the machine's global Node 20. Netlify's configured Node 22 and its adapter remain part of preview acceptance. No schema changed, so the old transactional SQL fixture was not rerun against the live project; this review used read-only checks and created no production test rows.

## Human release sequence and blockers

1. Confirm the local branch, final commit and clean tree with `git branch --show-current`, `git rev-parse HEAD`, `git status --short`.
2. Configure the preview environment above; resolve the owner-entered test-data classification and approve the real asset. Keep CURRENT/NEXT empty until publication is intentional.
3. Only when branch publication is authorized, run from the existing repository:

   ```sh
   git push --set-upstream origin feat/deipo-os-sprint-01
   ```

4. Open a PR targeting `main` to trigger the existing site's Deploy Preview. This handoff did not create a PR. Do not merge yet.
5. On the returned HTTPS preview URL, manually test `/admin/login`, `/admin`, `/admin/drops`, `/admin/drops/new`, `/admin/drops/<existing-id>`, `/admin/drops/<existing-id>/preview`, `/`, `/checkout`, and `/success`. Test direct anonymous access/incognito, sign-in, reload, logout/back/direct navigation, an existing non-admin account if available, and a session refresh after token expiry. Do not grant a new admin role for QA.
6. Verify real-image upload/preview and the image optimizer request; inspect Secure/host-only/SameSite cookies and private/no-store Admin responses in browser tools. On `/`, query strings such as `?mode=preview&state=active` must not expose fixtures. With no assigned current drop, expect safe unavailability; checkout/success must not produce an order or receipt.
7. Confirm the preview deployed the intended commit, uses the expected adapter/Node runtime, and passes mobile/keyboard/visual acceptance. Preview Admin writes use the same existing database, so use only intentional real changes.

**GO for a controlled preview only after environment setup and explicit publication authorization. NO-GO for merge while real asset acceptance, data classification/cleanup, the leaked-password setting decision, or HTTPS preview checks remain unresolved.** Sprint 02 is not started or authorized by this handoff.
