/**
 * dsh-bartending —— host 半：把「调酒」静态站挂到 DSH Web 的 `/bartending` 前缀下，
 * 复用 DSH 自己的登录闸门。
 *
 * 设计要点：
 *  - 只在本机进程内读文件，不起额外服务、不开端口：静态站在插件自己的 `app/site/`。
 *  - 每个请求先过 `ctx.connection.requestRejection()`：它返回 403（Host/Origin 不在
 *    信任围栏内）或 401（未通过浏览器登录），undefined 才放行。内嵌面板因此天然
 *    继承 DSH 的 token/cookie 会话，不需要另做一套认证。
 *  - 只读 GET/HEAD；路径解析后必须仍落在 site 目录内（防目录穿越）。
 *  - HTML 不缓存（改了立刻生效），其它静态资源短缓存。
 *  - `/bartending`（无尾斜杠）302 到 `/bartending/`：应用内部全是相对路径，缺尾斜杠
 *    会解析到错误的上一级。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** DSH Web 里挂载应用的前缀。 */
const ROUTE_PATH = '/bartending'
/** 静态站根目录（插件包内）。 */
const SITE_DIR = fileURLToPath(new URL('../app/site/', import.meta.url))
/** 日志前缀：方便在 DSH 日志里过滤本插件。 */
const LOG_PREFIX = '[dsh-bartending]'

/** 扩展名 → Content-Type。缺省按 application/octet-stream。 */
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}))

function sendPlain(res, status, text, extraHeaders = null) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...(extraHeaders || {}),
  })
  res.end(text)
}

/** 鉴权闸门：没登录/主机不可信就直接挡掉，绝不把本地静态站暴露出去。 */
function rejectUnprivileged(ctx, req, res) {
  let rejection
  try {
    const connection = ctx.get('connection', false)
    rejection = connection && typeof connection.requestRejection === 'function'
      ? connection.requestRejection(req)
      : 401
  } catch {
    rejection = 401
  }
  if (!rejection) return false
  const text = rejection === 403
    ? 'dsh web: 该请求的主机/来源不在信任列表内。\n'
    : 'dsh web authentication required; reopen the URL printed by dsh web.\n'
  sendPlain(res, rejection, text)
  return true
}

/** 把请求 URL 映射成磁盘相对路径；越界（含 ..、编码穿越）返回 null。 */
function resolveSitePath(rawUrl) {
  const pathname = String(rawUrl || '').split('?')[0].split('#')[0]
  let suffix
  try {
    suffix = decodeURIComponent(pathname.slice(ROUTE_PATH.length))
  } catch {
    return null
  }
  if (suffix === '') return null
  if (!suffix.startsWith('/')) return null
  let relative = suffix.replace(/^\/+/, '')
  if (relative === '' || relative.endsWith('/')) relative += 'index.html'
  const target = new URL(relative, `file://${SITE_DIR}`).pathname
  // URL 解析已消除 ..；再用前缀校验兜一层（防止符号链接之外的意外）。
  if (!target.startsWith(SITE_DIR.endsWith('/') ? SITE_DIR : `${SITE_DIR}${sep}`)) return null
  return target
}

/**
 * 创建 `/bartending` 前缀请求处理器（node http）。
 * @param {object} ctx - host 插件上下文（需要 connection 服务）。
 */
export function createHandler(ctx) {
  return function handleBartending(req, res) {
    if (rejectUnprivileged(ctx, req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendPlain(res, 405, 'Method Not Allowed\n', { allow: 'GET, HEAD' })
      return
    }
    const pathname = String(req.url || '').split('?')[0]
    if (pathname === ROUTE_PATH) {
      const query = String(req.url || '').slice(pathname.length)
      res.writeHead(302, { location: `${ROUTE_PATH}/${query}`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    const file = resolveSitePath(req.url)
    if (file === null) {
      sendPlain(res, 404, 'Not Found\n')
      return
    }
    stat(file).then((info) => {
      if (!info.isFile()) {
        sendPlain(res, 404, 'Not Found\n')
        return
      }
      const type = MIME.get(extname(file).toLowerCase()) || 'application/octet-stream'
      const headers = {
        'content-type': type,
        'content-length': info.size,
        'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300',
        'x-content-type-options': 'nosniff',
      }
      res.writeHead(200, headers)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      const stream = createReadStream(file)
      stream.on('error', (error) => {
        console.warn(`${LOG_PREFIX} read failed: ${file}: ${error && error.message}`)
        if (!res.headersSent) sendPlain(res, 500, 'Internal Server Error\n')
        else res.destroy()
      })
      stream.pipe(res)
    }).catch((error) => {
      if (error && error.code === 'ENOENT') {
        sendPlain(res, 404, 'Not Found\n')
        return
      }
      console.warn(`${LOG_PREFIX} stat failed: ${file}: ${error && error.message}`)
      sendPlain(res, 500, 'Internal Server Error\n')
    })
  }
}

export const name = 'dsh-bartending'
export const inject = ['webServer']

export function apply(ctx) {
  const handler = createHandler(ctx)
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PATH,
      handler,
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, 'dsh-bartending: /bartending static site')
}
