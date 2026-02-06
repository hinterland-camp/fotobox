import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Ensure the db plugin has run.')
  }
  return db
}

export function initDb(): void {
  const dataDir = join(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'fotobox.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0
    )
  `)
}
