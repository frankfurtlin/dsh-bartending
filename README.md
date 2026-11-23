<div align="center">

# dsh-bartending 「调酒」

**把 12 款 IBA 经典鸡尾酒的调酒教学站「微醺星球」装进 DSH：从侧栏「更多 → 调酒」打开，配方、做法与分步动画都在面板里。**

A DSH plugin that serves the Tipsy Planet cocktail guide inside the main panel, with a single entry in the sidebar's More menu.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/DSH-DeepSeek%20Harness-5b5ef7)](https://github.com/frankfurtlin/dsh-pocket)

[中文](README.md) · [English](README.en.md)

</div>

![面板里的调酒应用](docs/screenshots/hero.png)

## 这是什么

调酒原本是 betterlife 里的一个静态站（`app/domains/bartending/`），这个插件把它拆成独立的 DSH 插件：侧栏「更多」菜单只多一行「调酒」，点开在主面板内嵌同源 iframe，不占侧栏常驻位置。给想在 DSH 里随手查配方、看做法动画的人用。

应用本身不依赖前端库、没有构建步骤，host 半直接从插件内 `app/site/` 读静态文件，没有独立后端；鉴权完全复用 DSH 的登录闸门（未登录 401 / 来源不可信 403）。

## 功能

- **12 款 IBA 经典**：玛格丽特、莫吉托、尼格罗尼、古典鸡尾酒、曼哈顿、马天尼、代基里、威士忌酸、阿佩罗气泡酒、长岛冰茶、大都会、意式浓缩马天尼，每款含故事、用量（ml）、步骤、装饰、ABV 与难度。
- **3 种做法**：摇和 / 搅拌 / 直调，各带器材清单与判断标准。
- **动画舞台**：按配方生成 SVG 器材与材料，分步动画演示调制过程；可播放、重播、拖时间轴、点步骤跳转。
- **双主题**：明亮暖纸色 / 深色深夜星空，存在 `localStorage['tipsy-theme']`；动画舞台固定深色。
- **零构建**：不引前端库 CDN、没有打包器，CSS/JS 全是插件内相对路径。
- **只占「更多」一行**：注册在 `sidebar.panellist.actions`（order 40），不进侧栏常驻行。
- **鉴权交给 DSH**：只读 GET/HEAD，路径解析限制在站点目录内；HTML 不缓存、其它资源缓存 5 分钟。
- **工具条**：返回对话 / 刷新 / 新窗口打开。

## 安装

```bash
# 推荐：插件 → 添加插件 → 填本仓库绝对路径 → 安装 → 打开开关 → 刷新页面（热挂载，无需重启）
# 等价的手工方式：
dsh plugin --profile web add /root/workspace/plugins/dsh-bartending
# 再把 "dsh-bartending" 加进 profile package.json 的 dsh.profile.bundles
systemctl restart deepseek-harness.service
```

## 详细文档

后面几节是完整说明：功能细节、配置项、设计取舍、验收记录。

bestlife 的调酒静态站（原 `/root/workspace/betterlife/app/domains/bartending/`）拆成
独立 DSH 插件：**只在侧栏「更多」菜单出现一行「调酒」**，点开后在主面板内嵌同源
iframe 打开应用；不进侧栏常驻行。

- 宿主路由：`/bartending/`（`/bartending` 302 到带尾斜杠版本）
- 后端：**没有独立服务**，host 半直接读插件内 `app/site/` 的静态文件
- 鉴权：每个请求先过 DSH 的 `connection.requestRejection()`（未登录 401 / 不可信来源 403）

### 结构

```
package.json           插件声明（dsh.bundle.patch / dsh.client.platform=web）
cordis.patch.yml       bundle 补丁：insert id=dsh-bartending
lib/index.js           host 半：/bartending 前缀静态服务 + 鉴权 + 防穿越
client.js              client 半：main 面板（工具条 + iframe）+「更多」菜单行
app/site/              调酒应用本体（index.html / css / js，从 betterlife 原样复制）
verification/verify.mjs Playwright 端到端验收（DSH 内）
```

### 安装 / 卸载（Lead 执行）

```bash
# 安装（写 profile 的 link: 依赖 + bundles）
plugin_manager action=install_bundle target=/root/workspace/plugins/dsh-bartending
# 卸载
plugin_manager action=remove_bundle target=dsh-bartending
```

安装是热挂载，DSH 无需重启；浏览器刷新页面即可看到「更多 → 调酒」。

### 验收

```bash
cd /root/workspace/plugins/dsh-bartending/verification
TOKEN=$(journalctl -u deepseek-harness --no-pager --since today | grep -o 'token=[A-Za-z0-9_-]*' | tail -1)
node verify.mjs --url "http://127.0.0.1:3080/?$TOKEN"
```

最近一次结果：7/7 通过（匿名 401 / 更多入口 / 调酒行 / iframe 挂载 / 应用标题渲染 /
无本插件 console error），截图在 `verification/shots/`：
`02-more-menu.png`（菜单行）、`04-app.png`（面板内应用）。

### 已知限制

- 应用主题与 DSH 主题互不联动（应用自己有 `tipsy-theme` 开关）。
- 「更多」菜单里的行依赖宿主 `sidebar.panellist.actions` 座位；若宿主升级改动该座位，
  需要同步更新 `client.js` 的注册名。
- 静态资源短缓存 5 分钟；改 `app/site/` 后刷新页面可能需要强刷。

### 更新应用本体

`app/site/` 是 betterlife 调酒站的副本；betterlife 侧继续改动后重同步：

```bash
rsync -a --delete /root/workspace/betterlife/app/domains/bartending/ \
  /root/workspace/plugins/dsh-bartending/app/site/
```

（后续 betterlife 瘦身时，把 `app/domains/bartending/` 作为唯一来源删除即可。）
