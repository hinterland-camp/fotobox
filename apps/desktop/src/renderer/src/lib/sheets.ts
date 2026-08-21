import QRCode from 'qrcode'
import {
  drawComposite,
  type CompositeContext,
  type FrameConfig
} from '../../../common/frames'

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 100)}`))
    img.src = src
  })
}

/**
 * Falls back to the bare camera frame when no artwork is configured, so a
 * booth set up without a frame still takes photos.
 */
export function layoutFor(config: FrameConfig, capture: HTMLCanvasElement): FrameConfig {
  if (config.path && config.width > 0 && config.height > 0) return config
  return {
    path: '',
    width: capture.width,
    height: capture.height,
    photo: { x: 0, y: 0, width: capture.width, height: capture.height },
    qr: null
  }
}

/**
 * Renders the code at several times its printed size and lets the canvas scale
 * it down: node-qrcode only draws whole-pixel modules, so asking it for the
 * exact box would round the symbol short and leave the artwork's placeholder
 * peeking out from under it.
 */
const QR_OVERSAMPLE = 4

export async function renderQrCode(url: string, boxSize: number): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    width: Math.round(boxSize * QR_OVERSAMPLE),
    // One module of quiet zone, matching how event artwork draws its placeholder
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  })
  return loadImage(dataUrl)
}

export interface Sheet {
  canvas: HTMLCanvasElement
  dataUrl: string
  blob: Blob
}

export async function renderSheet(
  layout: FrameConfig,
  capture: HTMLCanvasElement,
  frame: HTMLImageElement | null,
  qr: HTMLImageElement | null
): Promise<Sheet> {
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not open a 2D canvas to render the sheet')

  drawComposite(ctx as unknown as CompositeContext, layout, {
    photo: capture,
    frame,
    qr
  })

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode the sheet'))), 'image/png')
  })

  return { canvas, dataUrl, blob }
}
