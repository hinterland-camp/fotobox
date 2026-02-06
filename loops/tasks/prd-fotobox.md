# PRD: Fotobox - Branded Photo Booth App

## Introduction

Fotobox is a branded photo booth application for retail and marketing scenarios (trade shows, pop-up events, shop activations). It runs as a fullscreen kiosk-style Electron app that lets guests take photos with a connected camera, automatically applies a pre-configured PNG picture frame overlay, and optionally uploads the result to a server where guests can download their photo via a QR code. The download page doubles as a simple branded marketing page. The app also supports direct printing via a connected printer and local sharing.

The system is split into two parts:
- **Electron App** — the kiosk/photobooth experience (camera, capture, frame overlay, print, QR code, share)
- **Nuxt 4 Web App** — the backend for image storage and the branded download page

Both live in a Turborepo monorepo.

## Goals

- Provide a polished, fullscreen kiosk photobooth experience that is locked down with password protection
- Capture photos using a user-selected camera device with a countdown timer
- Automatically composite a pre-configured PNG frame overlay onto every captured photo
- Save photos locally on the device
- Upload photos to the Nuxt backend (when online) and generate a QR code linking to a unique download page
- Serve a branded download page for each photo that also functions as a light marketing page
- Support printing photos to a connected printer directly from the app
- Allow sharing photos via the system share dialog

## User Stories

### US-001: Monorepo & Project Scaffolding
**Description:** As a developer, I need the project scaffolded as a Turborepo monorepo so all packages share tooling and build from one root.

**Acceptance Criteria:**
- [ ] Turborepo monorepo initialized with `apps/desktop` (Electron) and `apps/web` (Nuxt 4) workspaces
- [ ] Shared `packages/shared` workspace for types/utilities shared between apps
- [ ] Tailwind CSS configured in both apps
- [ ] OxLint configured at root level with shared config
- [ ] Oxfmt configured at root level
- [ ] Vitest configured at root level with workspace support
- [ ] `turbo.json` defines `dev`, `build`, `lint`, `format`, `test` pipelines
- [ ] `pnpm dev` starts both apps concurrently
- [ ] Typecheck passes

### US-002: Electron App Shell with Fullscreen Kiosk Mode
**Description:** As an event organizer, I want the app to launch in fullscreen kiosk mode so guests cannot accidentally exit or access the desktop.

**Acceptance Criteria:**
- [ ] Electron app launches in fullscreen (kiosk mode)
- [ ] Window is frameless and always on top
- [ ] Standard OS keyboard shortcuts (Alt+F4, Cmd+Q) are intercepted and blocked
- [ ] App displays a main "photobooth" screen on launch
- [ ] Typecheck passes

### US-003: Password-Protected Exit
**Description:** As an event organizer, I want exiting the kiosk to require a password so guests cannot close the app.

**Acceptance Criteria:**
- [ ] Pressing `Escape` (or a configurable key combo) opens a password dialog overlay
- [ ] Incorrect password shows an error and returns to the photobooth screen
- [ ] Correct password exits kiosk mode and shows the settings/admin panel
- [ ] Password is configurable in the settings panel
- [ ] Default password is set on first launch
- [ ] Typecheck passes

### US-004: In-App Settings Panel
**Description:** As an event organizer, I want an in-app settings panel to configure the camera, frame, printer, server connection, and password.

**Acceptance Criteria:**
- [ ] Settings panel accessible only after entering the password (from US-003)
- [ ] Camera selection: dropdown listing available video input devices
- [ ] Frame upload: file picker to select a PNG overlay image, with preview
- [ ] Printer selection: dropdown listing available printers on the system
- [ ] Server URL: text input for the Nuxt web app URL (for uploads)
- [ ] Password: field to change the kiosk exit password
- [ ] Countdown duration: configurable (default 3 seconds)
- [ ] Settings persisted to a local JSON file via Electron's `app.getPath('userData')`
- [ ] "Return to Photobooth" button to re-enter kiosk mode
- [ ] Typecheck passes

### US-005: Camera Preview & Selection
**Description:** As a guest, I want to see a live camera preview on the photobooth screen so I can position myself before taking a photo.

**Acceptance Criteria:**
- [ ] Live camera feed displayed in the center of the photobooth screen using the selected camera device
- [ ] Camera feed fills the available space while maintaining aspect ratio
- [ ] If no camera is available, a friendly error message is shown
- [ ] Camera feed starts automatically when entering photobooth mode
- [ ] Frame overlay is shown on top of the live preview so the guest sees what the final photo will look like
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Countdown Timer & Photo Capture
**Description:** As a guest, I want to tap/click anywhere on the screen to start a countdown and automatically take a photo.

**Acceptance Criteria:**
- [ ] Tapping/clicking anywhere on the photobooth screen starts a visible countdown (default 3 seconds)
- [ ] Countdown is displayed as a large, centered number overlaying the camera feed
- [ ] Countdown has a subtle animation (e.g., scale/fade) for each tick
- [ ] At 0 a "flash" effect plays (brief white screen flash)
- [ ] Photo is captured from the camera feed at countdown end
- [ ] During countdown, additional taps/clicks are ignored (no double-trigger)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Frame Overlay Compositing
**Description:** As a guest, I want my photo to have the branded frame automatically applied so I get a polished, branded image.

**Acceptance Criteria:**
- [ ] After capture, the raw photo is composited with the PNG frame overlay using Canvas API
- [ ] Frame overlay is rendered on top of the photo at matching resolution
- [ ] Output image is a single PNG file with the frame baked in
- [ ] Compositing happens in under 1 second on typical hardware
- [ ] If no frame is configured, the raw photo is used as-is
- [ ] Typecheck passes

### US-008: Result Screen with Actions
**Description:** As a guest, I want to see my photo after it's taken and have options to print, share, or take another photo.

**Acceptance Criteria:**
- [ ] After compositing, the result screen shows the final framed photo
- [ ] "Print" button visible (if a printer is configured)
- [ ] "Share" button visible
- [ ] QR code displayed (if server is configured and device is online)
- [ ] "New Photo" button to return to the camera preview and take another
- [ ] Auto-return to camera preview after a configurable timeout (default 30 seconds) if no interaction
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Save Photo Locally
**Description:** As an event organizer, I want all photos saved locally so there is always a backup regardless of internet connectivity.

**Acceptance Criteria:**
- [ ] Every captured photo (with frame applied) is saved to a configurable local directory
- [ ] Default directory: `~/Pictures/Fotobox/`
- [ ] Files named with timestamp: `fotobox-YYYY-MM-DD-HHmmss.png`
- [ ] Saving happens immediately after compositing, before any upload attempt
- [ ] Typecheck passes

### US-010: Upload Photo to Server
**Description:** As a guest, I want my photo uploaded to the server so I can download it later via the QR code.

**Acceptance Criteria:**
- [ ] After local save, if server URL is configured and device is online, upload the image to the Nuxt backend via API
- [ ] API endpoint: `POST /api/photos` with multipart form data
- [ ] Server responds with a unique photo ID and download URL
- [ ] If upload fails (network error, server down), photo is queued for retry
- [ ] Queued photos are retried automatically when connectivity is restored
- [ ] Upload status is not shown to the guest (silent background operation)
- [ ] Typecheck passes

### US-011: QR Code Generation
**Description:** As a guest, I want to see a QR code on the result screen so I can scan it with my phone to download my photo.

**Acceptance Criteria:**
- [ ] After successful upload, a QR code is generated encoding the unique download URL
- [ ] QR code is displayed on the result screen (US-008)
- [ ] QR code is scannable by standard phone cameras
- [ ] If upload is pending/failed, QR code area shows a "Uploading..." or "Offline" indicator instead
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Share Photo via System Share
**Description:** As a guest, I want to share my photo using the system share dialog so I can send it via messaging apps or social media.

**Acceptance Criteria:**
- [ ] "Share" button triggers the OS-native share dialog (Electron `shell` or `dialog` API)
- [ ] Shares the composited PNG file
- [ ] If share is not available on the platform, the button opens a "Save As" dialog instead
- [ ] Typecheck passes

### US-013: Print Photo
**Description:** As a guest, I want to print my photo so I can take a physical copy home.

**Acceptance Criteria:**
- [ ] "Print" button sends the composited photo to the selected printer
- [ ] Uses Electron's `webContents.print()` or native printing API
- [ ] Print dialog is NOT shown to the guest (silent print to the pre-configured printer)
- [ ] If printing fails, a brief toast notification is shown
- [ ] Typecheck passes

### US-014: Nuxt Backend — SQLite Database & Photo API
**Description:** As a developer, I need a backend API to receive uploaded photos, store metadata in SQLite, and serve them for download.

**Acceptance Criteria:**
- [ ] SQLite database with `photos` table: `id` (UUID), `filename`, `original_name`, `uploaded_at`, `file_size`, `download_count`
- [ ] `POST /api/photos` — accepts multipart image upload, stores file on disk, creates DB record, returns `{ id, downloadUrl }`
- [ ] `GET /api/photos/:id` — returns photo metadata (for the download page)
- [ ] `GET /api/photos/:id/download` — serves the image file, increments download counter
- [ ] Uploaded images stored in a configurable directory (default: `./uploads/`)
- [ ] Input validation: only PNG/JPEG accepted, max file size 20MB
- [ ] Typecheck passes

### US-015: Branded Download Page
**Description:** As a guest, I want to visit the download link and see a branded page where I can download my photo.

**Acceptance Criteria:**
- [ ] Page at `/photo/:id` displays the photo in a card layout
- [ ] Prominent "Download" button that downloads the full-resolution image
- [ ] Configurable branding section: logo, tagline, and up to 3 links (e.g., website, social media)
- [ ] Branding configured via environment variables or a `branding.json` config file
- [ ] Page is responsive (mobile-first, since guests will scan QR codes on their phones)
- [ ] Open Graph meta tags set for nice social sharing previews (photo as og:image)
- [ ] Page shows a friendly 404 if the photo ID doesn't exist
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-016: Offline Resilience
**Description:** As an event organizer, I want the app to work fully offline so the photobooth runs even without internet.

**Acceptance Criteria:**
- [ ] Camera, capture, frame overlay, local save, and print all work without internet
- [ ] Upload queue persists to disk so queued photos survive app restarts
- [ ] QR code only appears when a photo has been successfully uploaded
- [ ] No errors or broken UI when offline
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The Electron app must launch in fullscreen kiosk mode with no window chrome
- FR-2: Exiting kiosk mode requires entering a configurable password
- FR-3: The settings panel must allow selecting a camera, uploading a PNG frame, selecting a printer, setting the server URL, changing the password, and configuring the countdown duration
- FR-4: The photobooth screen must show a live camera preview with the frame overlay on top
- FR-5: Clicking/tapping anywhere on the photobooth screen starts a configurable countdown (default 3s)
- FR-6: At countdown zero, the app captures a still frame from the camera feed
- FR-7: The captured photo must be composited with the PNG frame overlay using Canvas API, producing a single output PNG
- FR-8: The composited image must be saved locally immediately after capture
- FR-9: If online and server is configured, the image must be uploaded via `POST /api/photos`
- FR-10: A QR code encoding the download URL must be displayed on the result screen after successful upload
- FR-11: The "Print" button must print silently to the pre-configured printer
- FR-12: The "Share" button must trigger the OS-native share dialog
- FR-13: The result screen must auto-return to the camera preview after a configurable timeout
- FR-14: The Nuxt backend must store photos on disk and metadata in SQLite
- FR-15: The download page must display the photo with a download button and configurable branding
- FR-16: The app must function fully offline (camera, capture, frame, save, print) with upload queued for later

## Non-Goals

- No user accounts or authentication on the web app (download pages are public via unique IDs)
- No photo editing or filters beyond the frame overlay
- No multi-frame selection by guests (admin picks one frame)
- No photo gallery or event grouping on the web app (each photo has its own unique page)
- No real-time streaming or remote viewing of the photobooth
- No payment or monetization features
- No multi-language/i18n support in v1
- No cloud storage (photos stored on the server's local disk)

## Design Considerations

- **Photobooth screen:** Dark background, camera feed centered, frame overlay semi-transparent on preview. Minimal UI — the screen itself is the button.
- **Countdown:** Large, bold numbers (e.g., 120px+) centered over the camera feed. White text with a subtle drop shadow for readability.
- **Result screen:** Photo displayed large, action buttons below (Print, Share, New Photo). QR code in the bottom-right corner.
- **Settings panel:** Standard form layout, nothing fancy. Functional over beautiful.
- **Download page:** Clean, mobile-first card layout. Photo hero, download CTA, branding footer.
- **Tailwind CSS:** Use for all styling. Stick to utility classes, no custom CSS unless absolutely necessary.

## Technical Considerations

- **Monorepo structure:**
  ```
  fotobox/
  ├── apps/
  │   ├── desktop/        # Electron + Vue renderer
  │   └── web/            # Nuxt 4 (backend + download pages)
  ├── packages/
  │   └── shared/         # Shared types, utilities
  ├── turbo.json
  ├── package.json
  └── pnpm-workspace.yaml
  ```
- **Electron:** Use `electron-builder` for packaging. Renderer process uses Vue 3 (aligned with Nuxt's Vue version).
- **Camera access:** Use `navigator.mediaDevices.getUserMedia()` in the Electron renderer. Enumerate devices with `navigator.mediaDevices.enumerateDevices()`.
- **Frame compositing:** Use HTML5 Canvas API. Draw the photo first, then the frame PNG on top. Export as PNG via `canvas.toDataURL('image/png')`.
- **SQLite:** Use `better-sqlite3` or Drizzle ORM with SQLite driver in the Nuxt server.
- **QR Code:** Use `qrcode` npm package to generate QR code as data URL in the Electron renderer.
- **Printing:** Use Electron's `webContents.print()` API with `silent: true` and the selected printer name.
- **Offline queue:** Store pending uploads as JSON in `app.getPath('userData')/upload-queue.json`. Retry on an interval when connectivity is detected.
- **File uploads:** Use `multipart/form-data` with `FormData` API. Store files in a configured directory on the server.

## Success Metrics

- Photobooth captures and saves a photo in under 2 seconds after countdown ends
- Frame overlay compositing completes in under 1 second
- QR code is displayed within 3 seconds of photo capture (when online)
- Download page loads in under 2 seconds on mobile
- App runs stable for 8+ hours without crashes or memory leaks (event duration)
- All photos are preserved locally even if upload fails

## Open Questions

- Should there be a "gallery mode" in the app to browse previously taken photos?
- Should the download page have an expiry (e.g., photos auto-delete after 30 days)?
- Should the app support video/GIF capture in a future version?
- What resolution should the captured photos be? (Depends on camera hardware — should we allow configuring this?)
