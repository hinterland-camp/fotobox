import { join } from 'node:path'
import { createReadStream, existsSync } from 'node:fs'
import { getDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing photo ID' })
  }

  const db = getDb()
  const row = db
    .prepare('SELECT filename, original_name FROM photos WHERE id = ?')
    .get(id) as { filename: string; original_name: string } | undefined

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }

  const filePath = join(process.cwd(), 'uploads', row.filename)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, statusMessage: 'Photo file not found' })
  }

  db.prepare('UPDATE photos SET download_count = download_count + 1 WHERE id = ?').run(id)

  const contentType = row.filename.endsWith('.png') ? 'image/png' : 'image/jpeg'

  setResponseHeaders(event, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${row.original_name}"`,
  })

  return sendStream(event, createReadStream(filePath))
})
