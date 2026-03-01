import { copyFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import path from 'path'

const DB_PATH = path.resolve(process.cwd(), 'data', 'network.db')
const BACKUP_DIR = path.resolve(process.cwd(), 'backups')
const MAX_BACKUPS = 30

export function runDbBackup(): { backupPath: string; cleaned: number } {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const dateStamp = new Date().toISOString().split('T')[0]
  const backupFileName = `network-${dateStamp}.db`
  const backupPath = path.join(BACKUP_DIR, backupFileName)

  copyFileSync(DB_PATH, backupPath)

  // Clean old backups beyond MAX_BACKUPS
  const backups = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('network-') && f.endsWith('.db'))
    .sort()

  let cleaned = 0
  while (backups.length > MAX_BACKUPS) {
    const oldest = backups.shift()!
    unlinkSync(path.join(BACKUP_DIR, oldest))
    cleaned++
  }

  return { backupPath, cleaned }
}
