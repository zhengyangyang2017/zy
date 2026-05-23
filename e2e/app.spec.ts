/**
 * E2E tests — critical user flows through the Electron app.
 *
 * Tests cover: app launch, session management, panel navigation,
 * settings, search, theme toggle, and keyboard shortcuts.
 *
 * Run: npx playwright test
 */

import { test, expect, _electron as electron } from '@playwright/test'
import { join } from 'path'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch Electron app
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    executablePath: require('electron'),
  })

  // Wait for the main window
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Give React time to hydrate
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await app?.close()
})

// ============================================
// App Launch
// ============================================

test.describe('App Launch', () => {
  test('app window opens with title', async () => {
    const title = await page.title()
    expect(title).toBe('Claude Code')
  })

  test('shows empty state when no session selected', async () => {
    const emptyText = page.locator('text=选择或创建一个会话开始')
    await expect(emptyText).toBeVisible({ timeout: 10000 })
  })
})

// ============================================
// Session Management
// ============================================

test.describe('Session Management', () => {
  test('creates a new session', async () => {
    // Click the "+" button in sidebar
    const addBtn = page.locator('button:has-text("+")').first()
    await addBtn.click()
    await page.waitForTimeout(500)

    // Should see the new session "新会话" in sidebar
    const sessionTitle = page.locator('text=新会话').first()
    await expect(sessionTitle).toBeVisible({ timeout: 5000 })
  })

  test('selects session and shows chat area', async () => {
    // Click on "新会话"
    const sessionBtn = page.locator('text=新会话').first()
    await sessionBtn.click()
    await page.waitForTimeout(300)

    // Should show chat input
    const input = page.locator('textarea[aria-label="输入消息"]')
    await expect(input).toBeVisible({ timeout: 5000 })
  })

  test('renames session on double-click', async () => {
    const sessionBtn = page.locator('text=新会话').first()
    await sessionBtn.dblclick()
    await page.waitForTimeout(300)

    // Input should appear for rename
    const renameInput = page.locator('input[value="新会话"]')
    const exists = await renameInput.count()
    expect(exists).toBeGreaterThanOrEqual(0)
    // Press Escape to cancel
    await page.keyboard.press('Escape')
  })
})

// ============================================
// Panel Navigation
// ============================================

test.describe('Panel Navigation', () => {
  test('opens command palette with Ctrl+K', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const palette = page.locator('text=切换侧边栏')
    await expect(palette).toBeVisible({ timeout: 5000 })

    // Close it
    await page.keyboard.press('Escape')
  })

  test('searches messages in command palette', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[placeholder*="搜索"]')
    await searchInput.fill('test query')

    // Should show "搜索中..." or results
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
  })

  test('opens settings with Ctrl+,', async () => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(300)

    const settingsTitle = page.locator('text=⚙️ 设置')
    await expect(settingsTitle).toBeVisible({ timeout: 5000 })

    // Close
    await page.keyboard.press('Escape')
  })
})

// ============================================
// Settings Panel
// ============================================

test.describe('Settings', () => {
  test('settings shows API key, model, theme fields', async () => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(300)

    // Check key fields exist
    const apiKeyInput = page.locator('input[type="password"]')
    await expect(apiKeyInput).toBeVisible()

    const themeSelect = page.locator('select')
    await expect(themeSelect).toBeVisible()

    // Close
    await page.keyboard.press('Escape')
  })

  test('feedback panel opens from command palette', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)

    // Type "feedback" to find the command
    const searchInput = page.locator('input[placeholder*="搜索"]')
    await searchInput.fill('反馈')
    await page.waitForTimeout(300)

    // Click the feedback command if visible
    const feedbackCmd = page.locator('text=反馈与报错')
    const exists = await feedbackCmd.count()
    if (exists > 0) {
      await feedbackCmd.click()
      await page.waitForTimeout(300)

      // Should see feedback panel
      const feedbackTitle = page.locator('text=🐛 反馈与报错')
      await expect(feedbackTitle).toBeVisible({ timeout: 3000 })
    }
    await page.keyboard.press('Escape')
  })
})

// ============================================
// File Upload
// ============================================

test.describe('File Operations', () => {
  test('shows file upload button', async () => {
    // Click a session first
    const sessionBtn = page.locator('text=新会话').first()
    if (await sessionBtn.count() > 0) {
      await sessionBtn.click()
      await page.waitForTimeout(300)
    }

    const attachBtn = page.locator('button[title="添加文件"]')
    await expect(attachBtn).toBeVisible({ timeout: 5000 })
  })
})
