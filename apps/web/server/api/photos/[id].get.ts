import { getDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing photo ID' })
  }

  const db = getDb()
  const row = db
    .prepare(
      'SELECT id, filename, original_name, uploaded_at, file_size, download_count FROM photos WHERE id = ?',
    )
    .get(id) as
    | {
        id: string
        filename: string
        original_name: string
        uploaded_at: string
        file_size: number
        download_count: number
      }
    | undefined

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }

  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
    fileSize: row.file_size,
    downloadCount: row.download_count,
  }
})
