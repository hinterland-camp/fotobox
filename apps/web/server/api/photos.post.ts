import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { getDb } from '../utils/db'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg']

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)

  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  const file = form.find((part) => part.name === 'image')

  if (!file || !file.data || !file.type) {
    throw createError({ statusCode: 400, statusMessage: 'Missing image file field' })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type: ${file.type}. Only PNG and JPEG are accepted.`,
    })
  }

  if (file.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: `File too large. Maximum size is 20MB.`,
    })
  }

  const id = randomUUID()
  const ext = file.type === 'image/png' ? '.png' : '.jpg'
  const filename = `${id}${ext}`

  const uploadsDir = join(process.cwd(), 'uploads')
  mkdirSync(uploadsDir, { recursive: true })
  writeFileSync(join(uploadsDir, filename), file.data)

  const originalName = file.filename || 'photo' + ext
  const uploadedAt = new Date().toISOString()
  const fileSize = file.data.length

  const db = getDb()
  db.prepare(
    'INSERT INTO photos (id, filename, original_name, uploaded_at, file_size) VALUES (?, ?, ?, ?, ?)',
  ).run(id, filename, originalName, uploadedAt, fileSize)

  return {
    id,
    downloadUrl: `/photo/${id}`,
  }
})
