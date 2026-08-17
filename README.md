# Fotobox

Branded photo booth for hinterland events. A guest taps the screen, a countdown
runs, the photo is composited with a PNG frame, saved locally and uploaded to
the server. The booth then shows a QR code that opens the guest's photo on their
phone.

## Structure

```
apps/desktop     Electron kiosk app (Vue 3 renderer) — runs on the event tablet
apps/web         Nuxt 4 app — upload API and the branded download pages
packages/shared  Types shared between the two
```

## Development

```bash
pnpm install
pnpm dev          # Nuxt on :3000, Electron kiosk window
pnpm typecheck
pnpm lint
```

The booth's settings panel opens with `Escape` (default password `admin`) and
configures the camera, frame PNG, printer, server URL and upload token.

## Web app deployment

Deploy with `docker-compose.yml` (built for Coolify). Both volumes must persist —
losing them loses every guest's photo and download link.

| Variable | Purpose |
| --- | --- |
| `NUXT_UPLOAD_TOKEN` | Shared secret the booth must send to upload. **Uploads are refused while unset.** Generate with `openssl rand -base64 32`. |

Set the same value in the booth under Settings → Upload Token, and point the
booth at the public HTTPS URL — QR codes encode whatever server URL is
configured.

Branding on the download page (logo, app links) comes from
`apps/web/branding.json`.

## Releases

The tablet installer is built by CI and published to GitHub Releases, where the
in-app updater picks it up.

```bash
# bump "version" in apps/desktop/package.json, then
git tag v1.2.3 && git push origin v1.2.3
```

The installer is unsigned, so Windows SmartScreen warns on first run.
