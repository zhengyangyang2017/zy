import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export function saveFeedback(payload: { message: string; diagnostics: string }): { success: boolean; error?: string } {
  try {
    const userDataPath = app.getPath('userData')
    const feedbackDir = join(userDataPath, 'feedback')
    if (!existsSync(feedbackDir)) {
      mkdirSync(feedbackDir, { recursive: true })
    }

    const entry = {
      ...payload,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    }

    const filePath = join(feedbackDir, 'feedback.jsonl')
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
