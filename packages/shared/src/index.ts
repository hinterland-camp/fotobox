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
