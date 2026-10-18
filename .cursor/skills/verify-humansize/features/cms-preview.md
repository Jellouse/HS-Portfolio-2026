# CMS preview

Editors signed into Keystatic with push access open a live SSR preview of one project, including unpublished drafts, without waiting for a rebuild.

## Sub-features

- `preview-button` Keystatic collection `previewUrl` → `/preview/{slug}?branch={branch}`.
- `preview-auth` no session → 404; push token → 200 with project body.
- `preview-headers` `noindex` + `Cache-Control: private, no-store`.
- `preview-badge` grey "Preview" / "Preview, unpublished" marker.

## How to get to it (user POV)

- In `/keystatic`, open a project, save, click Preview.
- Or `GET /preview/<slug>?branch=main` while signed into the CMS on the same origin.

## Driving it with verify-humansize

Preconditions:

- Live `BASE_URL` with Keystatic secrets (not local static-only serve).
- Optional: GitHub token with push on `Jellouse/HS-Portfolio-2026`.

- **Deny anonymous.** `curl -sI $BASE_URL/preview/vitra-chairfinder` → 404, `private, no-store`, `x-robots-tag: noindex`.
- **Allow editor.** `curl -sH "Authorization: Bearer $TOKEN" "$BASE_URL/preview/vitra-chairfinder?branch=main"` → 200, contains `preview-badge` and Vitra content.
- **Proof.** Save response headers and a screenshot of the preview page under `artifacts/verify-humansize/cms-preview/`.

## Gotchas

- Hard-refresh Keystatic after deploy if Preview is missing.
- Images not in the build fall back to raw.githubusercontent.com for the branch ref.
- Preview must stay out of sitemap and robots.
