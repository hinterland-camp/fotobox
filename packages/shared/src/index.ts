export interface Photo {
  id: string
  filename: string
  originalName: string
  uploadedAt: string
  fileSize: number
  downloadCount: number
}

export interface UploadResponse {
  id: string
  downloadUrl: string
}

export interface BrandingLink {
  label: string
  url: string
}

export interface BrandingAppCta {
  headline: string
  appStoreUrl?: string
  playStoreUrl?: string
  fallbackUrl?: string
}

export interface Branding {
  logo: string
  tagline: string
  links: BrandingLink[]
  appCta?: BrandingAppCta
}
