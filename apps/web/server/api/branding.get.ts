import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface BrandingLink {
  label: string
  url: string
}

interface Branding {
  logo: string
  tagline: string
  links: BrandingLink[]
}

const defaultBranding: Branding = {
  logo: '',
  tagline: 'Powered by Fotobox',
  links: [],
}

export default defineEventHandler((): Branding => {
  const brandingPath = join(process.cwd(), 'branding.json')

  if (!existsSync(brandingPath)) {
    return defaultBranding
  }

  try {
    const raw = readFileSync(brandingPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<Branding>
    return {
      logo: parsed.logo || defaultBranding.logo,
      tagline: parsed.tagline || defaultBranding.tagline,
      links: Array.isArray(parsed.links) ? parsed.links.slice(0, 3) : defaultBranding.links,
    }
  } catch {
    return defaultBranding
  }
})
