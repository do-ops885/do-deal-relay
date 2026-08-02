# PEV Spec — Installable Dashboard PWA

## Task

**Title**: Add installable PWA support to the public dashboard
**Author**: Buffy / GOAP swarm
**Date**: 2026-08-02
**Priority**: low

## Goal

Make the existing `public/` dashboard installable on supported mobile and desktop browsers while preserving the existing API and client-side routes.

## Approach

Add a Web App Manifest, a small cache-first service worker for same-origin static assets, registration and install metadata in the existing HTML shell, and Cloudflare Worker static-asset configuration with a safe SPA fallback.

## Non-Goals

- [x] Not replacing the existing dashboard UI or client-side router.
- [x] Not caching API responses, authenticated data, or external requests.
- [x] Not introducing a frontend build framework or runtime dependency.
- [x] Not changing backend API behavior or authentication.

## Steps

| Step | Description | Files Touched | Risk |
|------|-------------|---------------|------|
| 1 | Configure Cloudflare static assets and SPA fallback | `wrangler.jsonc`, `worker/index.ts`, `worker/types.ts` | medium |
| 2 | Add manifest, service worker, and HTML registration metadata | `public/manifest.webmanifest`, `public/sw.js`, `public/index.html`, `public/js/app.js` | low |
| 3 | Add focused asset/PWA contract tests and deployment notes | `tests/unit/pwa-assets.test.ts`, `docs/DEPLOYMENT.md` | low |
| 4 | Reconcile roadmap state and progress records | `plans/GOAP_STATE.md`, `plans/GOAP-ANALYSIS-2026-07-30.md`, `plans/PROGRESS-2026-08-02.md` | low |

## Acceptance Criteria

- [x] `/manifest.webmanifest` is served from the deployed Worker with a valid manifest MIME type.
- [x] `/sw.js` is served from the deployed Worker with a JavaScript MIME type and registers successfully from the dashboard.
- [x] The manifest has a name, short name, start URL, standalone display mode, theme/background colors, and icons.
- [x] The service worker only caches same-origin static assets and never caches API responses or non-GET requests.
- [x] SPA navigation remains available for dashboard routes while API/health routes retain their current behavior.
- [x] Typecheck, formatting, unit tests, markdown lint, and PEV gates pass or pre-existing failures are documented.

## Open Questions

- [x] None; the existing public shell and Worker deployment are the chosen integration points.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Static fallback could mask missing API routes | medium | Limit SPA fallback to non-API navigation requests and preserve API/health 404s. |
| Service worker could serve stale authenticated data | high | Cache only versioned/static same-origin assets; never cache `/api/`, `/health`, or `/deals`. |
| Wrangler asset binding could affect local tests | medium | Make asset serving conditional and keep route handling first. |

## Dependencies

- [x] Cloudflare Workers Static Assets support in the deployed Wrangler configuration.

## Out of Scope for This Spec

- Native mobile apps.
- Push notifications, background sync, and offline mutation queues.
- Dashboard feature redesign.
