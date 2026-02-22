# ASSUMPTIONS

- Local mobile/API development should target `http://127.0.0.1:4000` unless a different host is explicitly required by environment/network setup.
- Next.js admin build warning about missing ESLint is non-blocking because production build output and type checks complete successfully; treated as tooling warning, not functional breakage.
- Real-device QA cannot be executed from this headless workspace; physical-device validation is treated as a manual gate using `QA_CHECKLIST.md` section `Real-Device QA (Physical iPhone)`.
- Tenant-level beta settings (test mode + email template subjects) are stored in `Tenant.emailProviderMeta` JSON to avoid introducing a migration during beta hardening.
- Email delivery defaults to stub logging for private beta unless SMTP credentials are explicitly configured.
