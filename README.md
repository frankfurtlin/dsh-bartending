# dsh-bartending 「调酒」

bestlife 的调酒静态站（原 `/root/workspace/betterlife/app/domains/bartending/`）拆成
独立 DSH 插件：**只在侧栏「更多」菜单出现一行「调酒」**，点开后在主面板内嵌同源
iframe 打开应用；不进侧栏常驻行。

- 宿主路由：`/bartending/`（`/bartending` 302 到带尾斜杠版本）
- 后端：**没有独立服务**，host 半直接读插件内 `app/site/` 的静态文件
- 鉴权：每个请求先过 DSH 的 `connection.requestRejection()`（未登录 401 / 不可信来源 403）

## 结构

```
package.json           插件声明（dsh.bundle.patch / dsh.client.platform=web）
cordis.patch.yml       bundle 补丁：insert id=dsh-bartending
lib/index.js           host 半：/bartending 前缀静态服务 + 鉴权 + 防穿越
client.js              client 半：main 面板（工具条 + iframe）+「更多」菜单行
app/site/              调酒应用本体（index.html / css / js，从 betterlife 原样复制）
verification/verify.mjs Playwright 端到端验收（DSH 内）
```

## 安装 / 卸载（Lead 执行）

```bash
# 安装（写 profile 的 link: 依赖 + bundles）
plugin_manager action=install_bundle target=/root/workspace/plugins/dsh-bartending
# 卸载
plugin_manager action=remove_bundle target=dsh-bartending
```

安装是热挂载，DSH 无需重启；浏览器刷新页面即可看到「更多 → 调酒」。

## 验收

```bash
cd /root/workspace/plugins/dsh-bartending/verification
TOKEN=$(journalctl -u deepseek-harness --no-pager --since today | grep -o 'token=[A-Za-z0-9_-]*' | tail -1)
node verify.mjs --url "http://127.0.0.1:3080/?$TOKEN"
```

最近一次结果：7/7 通过（匿名 401 / 更多入口 / 调酒行 / iframe 挂载 / 应用标题渲染 /
无本插件 console error），截图在 `verification/shots/`：
`02-more-menu.png`（菜单行）、`04-app.png`（面板内应用）。

## 已知限制

- 应用主题与 DSH 主题互不联动（应用自己有 `tipsy-theme` 开关）。
- 「更多」菜单里的行依赖宿主 `sidebar.panellist.actions` 座位；若宿主升级改动该座位，
  需要同步更新 `client.js` 的注册名。
- 静态资源短缓存 5 分钟；改 `app/site/` 后刷新页面可能需要强刷。

## 更新应用本体

`app/site/` 是 betterlife 调酒站的副本；betterlife 侧继续改动后重同步：

```bash
rsync -a --delete /root/workspace/betterlife/app/domains/bartending/ \
  /root/workspace/plugins/dsh-bartending/app/site/
```

（后续 betterlife 瘦身时，把 `app/domains/bartending/` 作为唯一来源删除即可。）
