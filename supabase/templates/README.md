# DEIPO OS invitation

Acceptance project only: `deipo-os-acceptance` / `zyixizuutoyccouuijjz`.

- Subject: **Tu acceso está listo. — DEIPO OS**
- Paste `invite.html` into Authentication → Email → Invite user → Body.
- Keep `{{ .ConfirmationURL }}` intact. It is the single CTA destination; do not replace it with SiteURL or a hand-built token URL.
- Recommended sender display name: **DEIPO OS**. Current sender `deipo.` was left unchanged.
- `invite.txt` is the plain-text fallback deliverable. The dashboard exposes an HTML body; no separate MIME plain-text configuration was applied.

On 2026-10-11 the acceptance invitation subject/body were saved and read back after reload; HTML matched this file exactly. No other email template or SMTP credential was changed. Existing official PNG wordmark is hosted at https://deipo.netlify.app/brand/deipo-black.png with text alternative. Layout uses presentation tables and inline CSS, system fonts and a constrained fluid width; no scripts, web fonts or tracking.

Dashboard preview is verified. Actual Gmail/Outlook delivery and rendering, and a newly issued branded invitation's token acceptance, remain pending human mailbox validation. Previously issued emails do not change when this template is updated. Production was not changed.
