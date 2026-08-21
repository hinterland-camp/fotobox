import { describe, expect, it } from 'vitest'
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import QRCode from 'qrcode'
import {
  coverCrop,
  drawComposite,
  normaliseFrameConfig,
  type CompositeContext,
  type FrameConfig
} from '../src/common/frames'

const WINDOW = { x: 20, y: 60, width: 200, height: 150 }
const CODE_BOX = { x: 20, y: 300, width: 40, height: 40 }
const BAR_HEIGHT = 70

const LAYOUT: FrameConfig = {
  path: 'artwork.png',
  width: 240,
  height: 360,
  photo: WINDOW,
  qr: CODE_BOX
}

/**
 * Stands in for event artwork: a solid bar that must end up over the photo, a
 * placeholder code the booth is expected to cover, and transparency elsewhere
 * so the sheet's own white shows through.
 */
function artwork(): Canvas {
  const canvas = createCanvas(LAYOUT.width, LAYOUT.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, LAYOUT.width, BAR_HEIGHT)
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(CODE_BOX.x, CODE_BOX.y, CODE_BOX.width, CODE_BOX.height)
  return canvas
}

/** A widescreen camera frame whose outer strips a square-ish window must trim. */
function capture(): Canvas {
  const canvas = createCanvas(320, 180)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffff00'
  ctx.fillRect(0, 0, 320, 180)
  ctx.fillStyle = '#00ff00'
  ctx.fillRect(40, 0, 120, 180)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(160, 0, 120, 180)
  return canvas
}

function render(qr: Canvas | Awaited<ReturnType<typeof loadImage>> | null): Canvas {
  const canvas = createCanvas(LAYOUT.width, LAYOUT.height)
  drawComposite(canvas.getContext('2d') as unknown as CompositeContext, LAYOUT, {
    photo: capture(),
    frame: artwork(),
    qr
  })
  return canvas
}

function rgbAt(canvas: Canvas, x: number, y: number): string {
  const [r, g, b] = canvas.getContext('2d').getImageData(x, y, 1, 1).data
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

describe('coverCrop', () => {
  it('trims the sides of a wide source to fill a narrower window', () => {
    expect(coverCrop(320, 180, { x: 0, y: 0, width: 200, height: 150 })).toEqual({
      sx: 40,
      sy: 0,
      sw: 240,
      sh: 180
    })
  })

  it('trims the top and bottom of a tall source', () => {
    expect(coverCrop(180, 320, { x: 0, y: 0, width: 150, height: 200 })).toEqual({
      sx: 0,
      sy: 40,
      sw: 180,
      sh: 240
    })
  })

  it('takes a source that already has the window shape whole', () => {
    // Exactly whole, not a rounding error short of it — the composite leans on
    // this to copy artwork across instead of resampling it.
    expect(coverCrop(1601, 1600, { x: 0, y: 0, width: 1601, height: 1600 })).toEqual({
      sx: 0,
      sy: 0,
      sw: 1601,
      sh: 1600
    })
  })
})

describe('normaliseFrameConfig', () => {
  it('pulls a hand-edited rect back inside the artwork', () => {
    const fixed = normaliseFrameConfig({
      ...LAYOUT,
      photo: { x: 500, y: -10, width: 9000, height: 20 }
    })
    expect(fixed.photo).toEqual({ x: 0, y: 0, width: 240, height: 20 })
  })

  it('forgets the layout of artwork that is no longer configured', () => {
    expect(normaliseFrameConfig({ ...LAYOUT, path: '' }).photo).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    })
  })
})

describe('drawComposite', () => {
  it('fills the sheet with white wherever nothing is drawn', () => {
    const sheet = render(null)
    expect(rgbAt(sheet, 230, 250)).toBe('#ffffff')
    expect(rgbAt(sheet, 10, 350)).toBe('#ffffff')
  })

  it('puts the camera frame in the window and the artwork over it', () => {
    const sheet = render(null)

    // Left of the window shows the source's left half, right shows its right
    expect(rgbAt(sheet, WINDOW.x + 10, WINDOW.y + 120)).toBe('#00ff00')
    expect(rgbAt(sheet, WINDOW.x + 190, WINDOW.y + 120)).toBe('#0000ff')

    // The bar overlaps the top of the window and wins there
    expect(rgbAt(sheet, WINDOW.x + 10, WINDOW.y + 5)).toBe('#ff0000')
  })

  it('trims rather than squashes a source the window cannot hold', () => {
    const sheet = render(null)
    const { data } = sheet.getContext('2d').getImageData(0, 0, LAYOUT.width, LAYOUT.height)
    let yellow = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 0) yellow++
    }
    expect(yellow).toBe(0)
  })

  it('leaves the artwork alone when there is no code to stamp', () => {
    const sheet = render(null)
    expect(rgbAt(sheet, CODE_BOX.x + 20, CODE_BOX.y + 20)).toBe('#ff00ff')
  })

  it('covers the placeholder code with the guest download code', async () => {
    const url = 'https://foto.hinterland.camp/photo/7f3c1d2e-9a4b-4c8d-b1e6-2f5a8c0d9e13'
    const qr = await loadImage(
      Buffer.from(
        (await QRCode.toDataURL(url, { width: CODE_BOX.width * 4, margin: 1 })).split(',')[1],
        'base64'
      )
    )
    const sheet = render(qr)
    const { data } = sheet
      .getContext('2d')
      .getImageData(CODE_BOX.x, CODE_BOX.y, CODE_BOX.width, CODE_BOX.height)

    let placeholder = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) placeholder++
    }
    expect(placeholder).toBe(0)

    // The stamped box is the code itself, scaled into place
    const expected = createCanvas(CODE_BOX.width, CODE_BOX.height)
    const expectedCtx = expected.getContext('2d')
    expectedCtx.imageSmoothingQuality = 'high'
    expectedCtx.drawImage(qr, 0, 0, qr.width, qr.height, 0, 0, CODE_BOX.width, CODE_BOX.height)
    expect(Buffer.from(data)).toEqual(
      Buffer.from(expectedCtx.getImageData(0, 0, CODE_BOX.width, CODE_BOX.height).data)
    )
  })
})
