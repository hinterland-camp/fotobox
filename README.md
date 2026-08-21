# Fotobox

Branded photo booth for hinterland events. A guest taps the screen, a countdown
runs, and the shot is laid into two pieces of artwork: the **share** image,
which is saved locally and uploaded to the server, and the **print** sheet,
which goes to the printer. The booth then shows a QR code that opens the guest's
photo on their phone.

The two sheets are different on purpose. The share image is the one guests post,
so it carries no download code. The print sheet does: the code the designer drew
into the artwork is replaced with one pointing at that guest's own upload, so a
printed photo can be picked up again from a phone.

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
pnpm test
```

The booth's settings panel opens with `Escape` (default password `admin`) and
configures the camera, the two artworks, printer, paper size, server URL and
upload token. Paper size must match the media loaded in the printer — photos are
printed edge to edge on that sheet.

### Artwork

Each artwork is a PNG at the sheet's full resolution, transparent wherever the
photo or the paper should show through. Alongside it the operator sets, in that
PNG's own pixels:

| Setting | What it is |
| --- | --- |
| Photo window | The rectangle the camera frame is drawn into, underneath the artwork. The frame is centre-cropped to fit, never squashed. |
| Download code | Optional, and normally only on the print sheet. The box covering the placeholder QR the designer drew, which the booth repaints with a code pointing at the guest's upload. |

Both boxes are drawn over the preview in the settings panel, so a layout can be
checked without printing anything.

Shots are taken at the print sheet's photo window exactly — centre-cropped from
the camera, never squashed — so laying one into a sheet is a straight copy. The
booth screen shows the plain camera cropped to that same shape: guests line up
against the framing they will get, but never see the artwork until the photo is
done.

Until a photo reaches the server there is no personal link to encode, so the
print sheet keeps the artwork's own code rather than getting a dead one stamped
over it. A booth that prints while offline still hands out a working QR.

A booth upgraded from the old single full-bleed overlay keeps it: that PNG
becomes both artworks with the photo filling the frame, exactly as it printed
before.

## Web app deployment

Deploy with `docker-compose.yml` or the root `Dockerfile`. **The build context
must be the repo root** — the web app is built from the workspace, so a context
of `apps/web` cannot see `packages/shared` or the lockfile.

Both volumes must persist — losing them loses every guest's photo and download
link.

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
