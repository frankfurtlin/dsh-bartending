/**
 * dsh-bartending 端到端验收（Playwright，chromium headless）。
 *
 * 用法：
 *   node verify.mjs --url "http://127.0.0.1:3080/?token=<launch-token>" [--out DIR]
 *
 * 覆盖：
 *  1. 匿名访问 /bartending/ 必须被 DSH 鉴权挡下（401）。
 *  2. 登录后侧栏出现「更多（More）」入口 —— 说明 sidebar.panellist.actions 已注册。
 *  3. 「更多」菜单里有「调酒」行；点它后主面板挂载 iframe 到 /bartending/。
 *  4. iframe 内应用标题渲染成功（iFrame 真正连到宿主的静态服务）。
 *  5. 截图留档。
 */
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire('/root/workspace/hermes-site/tools/node_modules/')
const { chromium } = require('playwright')

const args = process.argv.slice(2)
function arg(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const URL = arg('url')
if (!URL) {
  console.error('缺少 --url "http://127.0.0.1:3080/?token=..."')
  process.exit(2)
}
const OUT = arg('out', join(dirname(fileURLToPath(import.meta.url)), 'shots'))
await mkdir(OUT, { recursive: true })

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
try {
  // 1. 匿名访问必须 401。
  {
    const anonymous = await browser.newContext()
    const response = await anonymous.request.get('http://127.0.0.1:3080/bartending/')
    const body = await response.text()
    check('匿名 /bartending/ 被拦', response.status() === 401, `HTTP ${response.status()} ${body.trim().slice(0, 60)}`)
    await anonymous.close()
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    if (/bartending/i.test(request.url())) consoleErrors.push(`requestfailed ${request.url()}`)
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, '01-sidebar.png') })

  // 2. 侧栏「更多」入口。
  const moreButton = page.locator('button[aria-label="更多"], button[aria-label="More"]').first()
  const moreCount = await moreButton.count()
  check('侧栏出现「更多」入口', moreCount > 0)
  if (moreCount > 0) {
    await moreButton.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, '02-more-menu.png') })

    // 3. 菜单里的「调酒」行。
    const menuItem = page.getByRole('menuitem', { name: /调酒/ }).first()
    const menuItemByText = menuItem.or(page.locator('[role="menu"] button', { hasText: '调酒' })).first()
    const menuItemCount = await menuItemByText.count()
    check('「更多」菜单出现「调酒」', menuItemCount > 0)
    if (menuItemCount > 0) {
      await menuItemByText.click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: join(OUT, '03-panel.png') })

      // 4. 主面板 iframe 指向 /bartending/ 且应用标题渲染。
      const frameElement = page.locator('iframe[data-dsh-bartending-frame]')
      check('主面板挂载调酒 iframe', (await frameElement.count()) > 0)
      const frame = page.frames().find((candidate) => candidate.url().includes('/bartending/'))
      check('iframe 指向 /bartending/', Boolean(frame), frame ? frame.url() : 'no frame')
      if (frame) {
        await frame.waitForLoadState('domcontentloaded')
        const title = await frame.title().catch(() => '')
        const hero = await frame.locator('.hero-title').count().catch(() => 0)
        check('调酒应用渲染成功', hero > 0 || title.includes('微醺'), `title=${title} hero=${hero}`)
        await page.waitForTimeout(600)
        await page.screenshot({ path: join(OUT, '04-app.png') })
      }
    }
  }

  // 只关心本插件相关的 console error：宿主的 experimental-inspector / dsh-passwords
  // 在 loopback 下本来就有既有 401/404，不是本插件的回归。
  const pluginErrors = consoleErrors.filter((text) => /bartending/i.test(text))
  check('本插件无 console error', pluginErrors.length === 0, pluginErrors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed; artifacts: ${OUT}`)
if (failed.length > 0) {
  console.log('FAILED:', failed.map((row) => row.name).join(', '))
  process.exit(1)
}
