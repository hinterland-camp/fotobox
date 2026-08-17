import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Branding, BrandingAppCta } from '@fotobox/shared'

const defaultBranding: Branding = {
  logo: '',
  tagline: 'Powered by Fotobox',
  links: [],
}

function parseAppCta(value: unknown): BrandingAppCta | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const cta = value as Partial<BrandingAppCta>
  if (typeof cta.headline !== 'string' || !cta.headline) {
    return undefined
  }

  const appCta: BrandingAppCta = { headline: cta.headline }
  if (typeof cta.appStoreUrl === 'string' && cta.appStoreUrl) {
    appCta.appStoreUrl = cta.appStoreUrl
  }
  if (typeof cta.playStoreUrl === 'string' && cta.playStoreUrl) {
    appCta.playStoreUrl = cta.playStoreUrl
  }
  if (typeof cta.fallbackUrl === 'string' && cta.fallbackUrl) {
    appCta.fallbackUrl = cta.fallbackUrl
  }
  return appCta
}

export default defineEventHandler((): Branding => {
  const brandingPath = join(process.cwd(), 'branding.json')

  if (!existsSync(brandingPath)) {
    return defaultBranding
  }

  try {
    const raw = readFileSync(brandingPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<Branding>
    const appCta = parseAppCta(parsed.appCta)
    return {
      logo: parsed.logo || defaultBranding.logo,
      tagline: parsed.tagline || defaultBranding.tagline,
      links: Array.isArray(parsed.links) ? parsed.links.slice(0, 3) : defaultBranding.links,
      ...(appCta ? { appCta } : {}),
    }
  } catch {
    return defaultBranding
  }
})
