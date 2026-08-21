// The booth renders every shot twice. The sheet that comes out of the printer
// and the file the guest shares from their phone are different artworks with
// different proportions, so each one carries its own layout: where the camera
// frame goes, and where — on the print — the download QR is stamped over the
// designer's placeholder.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface FrameConfig {
  /** Absolute path to the PNG we keep in userData; empty when none is set. */
  path: string
  /** The PNG's own pixel size — the coordinate space every rect below uses. */
  width: number
  height: number
  /** Where the camera frame is drawn, underneath the artwork. */
  photo: Rect
  /** Where the download QR is stamped on top. Null leaves the artwork alone. */
  qr: Rect | null
}

export type FrameVariant = 'print' | 'share'

/** A frame with no artwork behaves like the plain camera output. */
export const EMPTY_FRAME: FrameConfig = {
  path: '',
  width: 0,
  height: 0,
  photo: { x: 0, y: 0, width: 0, height: 0 },
  qr: null
}

/**
 * The starting point for freshly picked artwork: the photo fills the sheet, as
 * it did when the booth had a single full-bleed overlay. The operator then
 * pulls the window in to wherever the design leaves a hole for it.
 */
export function fullFrameConfig(path: string, width: number, height: number): FrameConfig {
  return { path, width, height, photo: { x: 0, y: 0, width, height }, qr: null }
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const w = Math.max(1, Math.min(Math.round(rect.width), width))
  const h = Math.max(1, Math.min(Math.round(rect.height), height))
  return {
    x: Math.max(0, Math.min(Math.round(rect.x), width - w)),
    y: Math.max(0, Math.min(Math.round(rect.y), height - h)),
    width: w,
    height: h
  }
}

/** Keeps a hand-edited or stale layout inside the artwork it belongs to. */
export function normaliseFrameConfig(config: FrameConfig): FrameConfig {
  if (!config.path || config.width <= 0 || config.height <= 0) return EMPTY_FRAME
  return {
    ...config,
    photo: clampRect(config.photo, config.width, config.height),
    qr: config.qr ? clampRect(config.qr, config.width, config.height) : null
  }
}

export interface SourceCrop {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * The slice of the camera frame that fills `dest` without distorting it —
 * `object-fit: cover` expressed as source coordinates. The frame is centred,
 * so a square window trims the sides of a widescreen camera rather than
 * squashing everyone into it.
 */
export function coverCrop(sourceWidth: number, sourceHeight: number, dest: Rect): SourceCrop {
  const source = sourceWidth / sourceHeight
  const target = dest.width / dest.height

  // Taken whole when the shapes already agree: dividing and multiplying the
  // way back would land a rounding error short of the real edge, and that is
  // enough to turn a plain copy into a resample.
  if (source === target) {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight }
  }
  if (source > target) {
    const sw = Math.min(sourceWidth, sourceHeight * target)
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight }
  }
  const sh = Math.min(sourceHeight, sourceWidth / target)
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh }
}

/** Anything with intrinsic pixel dimensions that a 2D context can draw. */
export interface DrawableImage {
  readonly width: number
  readonly height: number
}

/**
 * The slice of CanvasRenderingContext2D the composite actually needs. Written
 * structurally so the same code paints the browser canvas in the renderer and
 * a headless one in the tests.
 */
export interface CompositeContext {
  fillStyle: string
  imageSmoothingQuality?: 'low' | 'medium' | 'high'
  fillRect(x: number, y: number, width: number, height: number): void
  drawImage(image: DrawableImage, dx: number, dy: number): void
  drawImage(
    image: DrawableImage,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void
}

/**
 * Copies an image that is already the right size straight across, and only
 * reaches for the resampling filter when there is a genuine resize to do.
 * Artwork is normally drawn at exactly the sheet's resolution, and a filter
 * run over it costs a couple of levels on every pixel for nothing — some
 * canvas implementations apply one even at 1:1 unless the draw is unscaled.
 */
function blitOrScale(
  ctx: CompositeContext,
  image: DrawableImage,
  crop: SourceCrop,
  dest: Rect
): void {
  // A hair of tolerance, because a cover fit is reached through two divisions
  const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6

  const untouched =
    same(crop.sx, 0) &&
    same(crop.sy, 0) &&
    same(crop.sw, image.width) &&
    same(crop.sh, image.height) &&
    same(dest.width, image.width) &&
    same(dest.height, image.height)

  if (untouched) {
    ctx.imageSmoothingQuality = 'low'
    ctx.drawImage(image, dest.x, dest.y)
    return
  }

  // The camera frame is the one thing that really is scaled — usually up, into
  // a window larger than the sensor gave us — so it earns the better filter.
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, dest.x, dest.y, dest.width, dest.height)
}

export interface CompositeSources {
  /** The raw camera frame, cover-fitted into the layout's photo window. */
  photo: DrawableImage
  /** The artwork, stretched over the whole sheet. Null prints the bare photo. */
  frame: DrawableImage | null
  /** The guest's download code. Null keeps whatever the artwork already shows. */
  qr: DrawableImage | null
}

/**
 * Paints one sheet. White first: the artwork is mostly transparent and the
 * photo does not reach the edges, so anything left unpainted would print as
 * whatever the canvas happened to contain.
 */
export function drawComposite(
  ctx: CompositeContext,
  layout: FrameConfig,
  sources: CompositeSources
): void {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.width, layout.height)

  const box = layout.photo
  blitOrScale(ctx, sources.photo, coverCrop(sources.photo.width, sources.photo.height, box), box)

  if (sources.frame) {
    const frame = sources.frame
    blitOrScale(
      ctx,
      frame,
      { sx: 0, sy: 0, sw: frame.width, sh: frame.height },
      { x: 0, y: 0, width: layout.width, height: layout.height }
    )
  }

  // The designer's placeholder code is baked into the artwork, so the guest's
  // own code has to cover it completely — hence the white patch underneath.
  if (sources.qr && layout.qr) {
    const code = layout.qr
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(code.x, code.y, code.width, code.height)
    blitOrScale(ctx, sources.qr, { sx: 0, sy: 0, sw: sources.qr.width, sh: sources.qr.height }, code)
  }
}
