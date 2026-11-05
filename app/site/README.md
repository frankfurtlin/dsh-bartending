# 微醺星球 · 十二杯经典调酒指南

跟着动画学会 12 款 IBA 经典鸡尾酒的静态站，挂在 BetterLife 的 `/mine/bartending`。

## 访问

https://hermes.frankfurtlin.top/mine/bartending/

dashboard 顶部/底部导航的「调酒」标签页打开的就是这个地址。**必须带尾斜杠** ——
`/mine/bartending` 会 307 跳过来，原因见下面「相对路径」一节。

## 来源

按用户要求，直接采用 WorkBuddy 上发布的一页（2026-10-07 整站替换掉旧版「一杯之间」）：

- 分享页：https://www.workbuddy.link/p/65dRDjTbM7S44vwwRQ8jbI
- 实际文件：`https://workbuddy-space-static.codebuddy.work/page/65dRDjTbM7S44vwwRQ8jbI/napAKWgacCUr/index.html`

分享页只是一个 React 壳，真正的内容在它的 iframe 里。**不能直接加载那个 iframe 地址**：
它会注入 `inject.js` 套一层「🔒 Security Restriction（安全限制）」遮罩，必须下载到本地看。

### 取法

```bash
BASE=https://workbuddy-space-static.codebuddy.work/page/65dRDjTbM7S44vwwRQ8jbI/napAKWgacCUr
curl -sL "$BASE/index.html" -o bartending/index.html
mkdir -p bartending/css bartending/js
for f in css/style.css js/data.js js/main.js js/scene.js js/sound.js; do
  curl -sL "$BASE/$f" -o "bartending/$f"
done
```

### 移植时只做了两件事（渲染结果逐字节一致）

用 CDP 把「原始文件」和「移植后」各渲染一遍做签名比对，**662 个元素 / 文档高 2626 /
115 个 SVG 图形 / 965 字正文 / 标题全同**：

1. **剥掉 WorkBuddy 编辑器元数据** —— 190 个 `data-page-node-id`、2 个 `data-pnid-children`、
   26 处 `<!--pnid:-->` 注释。已 grep 确认 CSS/JS **都不依赖**这些属性，
   index.html 从 21.0KB 降到 11.9KB。
2. **去掉 `<script src="/page/page_comm/inject.js">`** —— WorkBuddy 运行时，
   独立访问是 404，而且正是它给直连页面套那个安全遮罩。

两条都有回归测试看着：`test_bartending_port_has_no_workbuddy_editor_leftovers`。

## 结构

```
bartending/
├── index.html      # 单页：导航 + hero + 配方网格 + 三种做法 + 详情（含 SVG 动画舞台）
├── css/style.css   # 明暗双主题（--bg/--card/--amber 等变量）；动画舞台固定深色
├── js/data.js      # 3 种做法 + 12 款配方的全部数据（参考 IBA，用量到 ml）+ 图片资产表 ASSETS
├── js/main.js      # hash 路由 #/cocktail/<id>、网格渲染、时间轴、主题/静音开关
├── js/scene.js     # 动画舞台：按配方生成 SVG 器材 + 分步动画（单场景 131–183 个元素）
├── js/sound.js     # WebAudio 音效（摇壶/倒酒/冰块），不需要外部音频文件
├── README.md       # 本文：来源、结构、部署、视觉与物理、性能与无障碍
├── ASSETS.md       # 图片资产：选图 / 生图 / 水印裁切 / 上传 + 换图 SOP
└── BACKLOG.md      # 后续可变更点清单（聊过但没做的都在这）
```

**零构建、无 JS 依赖**：不引 CDN、没有打包器，CSS/JS 全是本目录内的相对路径 (§ 部署)。
位图只有 12 张卡片图 + 1 张舞台背景，存在腾讯云 COS、页面引用 EO 域名（见 `ASSETS.md`）；
除此之外所有图形都是程序化 SVG。favicon 是页面自带的 inline `data:image/svg+xml`
（金色星球 + 光环，与站名同源）。

## 内容

- **12 款 IBA 经典**：玛格丽特、莫吉托、尼格罗尼、古典鸡尾酒、曼哈顿、马天尼、代基里、
  威士忌酸、阿佩罗气泡酒、长岛冰茶、大都会、意式浓缩马天尼。
  每款含故事、配料（精确到 ml 与配色）、调制步骤、装饰、ABV、难度。
  名单以 `js/data.js` 为准（改数据时同步改这里，两者不一致过一次）。
- **3 种做法**：摇和 SHAKE / 搅拌 STIR / 直调 BUILD，各带器材清单与判断标准。
- **动画舞台**：按配方生成杯子/器具/材料，分步动画演示调制过程。

## 交互

- 点配方卡 → `location.hash = '#/cocktail/<id>'` → 进入详情
- 详情页：播放 / 重播动画、拖拽时间轴擦洗、点步骤块跳转、静音开关、返回
- 主题开关：明亮（暖纸色）/ 深色（深夜星空），存 `localStorage['tipsy-theme']`

## 写实素材（v0.74.0）

第二轮把「还有矢量感」的地方换成 AI 生成的写实照片，**每一处都有矢量降级**：

- **三种做法**：卡片改成「16:10 照片横幅 + 文字」，原线稿图标留作降级。
- **22 种配料**：配料行左侧 38px 写实小图（原色块仍在 DOM 里，只是被图盖住）；捣压材料
  （薄荷叶 / 青柠角 / 糖浆）与「装饰」那一行的小图也换成了照片。这些图与**舞台架上酒瓶共用同一批**
  （都从 `data.js` 的 `ASSETS` 表取），不会出现「列表里是 A、台上是 B」。
- **舞台**：酒瓶 / 吧匙 / 捣棒 / 装饰换成透明底贴图；**载杯 / 量酒器 / 混合杯 / 摇壶 / 冰块保留矢量**
  —— 前四件内部都有 `clip-path` 驱动的液面动画（倒酒时涨、滤酒时降），冰块是透明物体抠不了。
- 贴图与矢量件放在**同一个 group**、按同一套坐标摆（瓶子底边中点对齐原点、盒子高 `mouthY + 8`），
  所以**倒酒出口、晃动锚点、投影位置都没动** —— 物理与时间轴一行没改，28 项判据照旧全过。
- 代价：贴上照片瓶后瓶身小标签不再显示（照片瓶更窄）；用量提示仍由倒酒时的浮动标签给出。
- 资产清单、生成提示词、抠白底细节与换图 SOP 全在 `ASSETS.md`。

## 视觉与物理（v0.73.0）

- **卡片图换成真实照片**：12 杯各一张 AI 生成的写实产品照（纯黑无缝背景 + 暖色轮廓光 + 单品居中），
  存腾讯云 COS、页面引用 EO 域名（`data.js` 里的 `img` 字段）；卡片改成「照片顶部横幅 + 信息在下」。
  出图自带的「AI生成 / WORKBUDDY」水印按**实测位置**只裁右侧（12 张裁切窗口完全相同，卡片里杯子
  大小才对得齐），并在页脚显式标注「卡片图片由 AI 生成」。
- **离线降级**：图在 EO 域名上，加载失败（断网 / 被墙 / 图挂了）时卡片自动露出原来的矢量小杯
  （`.card-photo.photo-failed`），不留破图。
- **倒酒液流是真抛射**：出口速度由手（瓶子 / 量酒器 / 注入瓶）的位移**数值微分**得到，再叠托里拆利
  溢出速度 √(2gh)；轨迹 = `p0 + v0·t + ½g·t²`，落点解一元二次方程，液柱宽度按连续性方程随速度收细。
  尺度：载杯 ≈ 100 mm ⇒ 1 m ≈ 1000 px ⇒ **g ≈ 9800 px/s²**。残滴也是真自由落体。
- **液位解体积方程**：杯壁按「底宽→口宽」线性渐变近似，V 形马天尼杯（底窄口宽）同样体积涨得更高。
- **液面晃动是阻尼振子**：θ(t) = (J/ω_d)·e^(−ζω₀t)·sin(ω_d t)，ω₀ = √(g/L)（液层越浅晃得越快），
  冲量来自液流砸进液面的动量。因此 `render(t)` **与墙钟无关** —— 旧版用 `performance.now()` 凑涟漪，
  拖回同一时刻画面会变样。
- 物理纯函数导出在 `TIPSY.phys`（`GRAV`/`projAt`/`fallTime`/`levelFromVolume`/`sloshAngle`），
  探针直接对它们做单元核对；渲染结果的判据是「等时间采样下 Δx 恒定 + ΔΔy 恒定」（近垂直轨迹用
  `y=f(x)` 拟合抛物线是病态问题，不能那么验）。
- **烘焙仿真**：落冰 / 摇和 / 搅拌 / 捣压这些**有状态**的运动（碰撞、回弹、停下）写不成 t 的闭式解，
  于是建场景时按 **1/120 s** 固定步长先跑一遍、把轨迹烘成 `Float32Array`，`render(t)` 只做插值采样 ——
  时间轴照样能精确擦洗。随机量用固定种子的伪随机，同一杯酒每次打开都一样。
  - 落冰：重力 + 反弹（e=0.28）+ 摩擦 + 冲击转自转 + 动能不足即休眠。
  - 摇和：手是**真实时间 4.5 Hz** 的三连击（幅度阻尼衰减）；冰块在非惯性系里被伪力 −a 甩动、
    撞壁交换动量；松手后壶自由落体砸台面弹两下（取代 `easeOutBounce`）。
  - 搅拌：吧匙按真实时间 0.9 Hz 画圆；液体一阶粘性跟随（起转跟不上、之后追上、停手有余转）；
    冰块自转滞后并被离心甩向外圈。
  - 捣压：捣棒有质量（弹簧-阻尼跟随），触底速度反射（e=0.25），冲击一部分变成薄荷形变、一部分
    变成液面冲量。
- **材质一律用渐变、不用 SVG 滤镜**（滤镜会让浏览器每帧重算模糊）：柔影（物体升高时变大变淡）、
  背景雾（便宜的景深）、玻璃高光条、杯壁折射带、液面弯月面、整场暗角。
- 物理纯函数导出在 `TIPSY.phys`；烘焙出的轨迹无法直接比对，探针改为从**渲染结果**反推
  （匀加速的离散签名、不穿透、反弹衰减、粘性滞后等）。

## 性能与无障碍（v0.72.0）

- **暂停不空转**：详情页只在播放中才跑 `requestAnimationFrame` 渲染；暂停 / 打开后静止时不再每帧
  重绘（原先无论是否播放都 60fps 一直 `render()`，读配方时白烧 CPU）。拖时间轴、点步骤块、
  方向键都改走 `renderFrame()`（= `stage.render` + `syncUI`）立即重绘当前帧，场景与进度条 /
  时间标签都不会掉队。
- **星空按需建**：明亮模式下星空本就 `display:none`，现在连那 70 / 140 个 `<span>` 都不创建，
  切到暗黑时才补建（`syncStars()`）。
- **步骤播报**：`#stage-live`（`role="status" aria-live="polite"` + `.sr-only`）把
  「第 N / M 步：<步骤名>」念给屏幕阅读器；当前步骤 chip 带 `aria-current="true"`。
- **视图切换搬运焦点**：进详情聚焦标题 `#d-name`（顺带从 `<h2>` 升为 `<h1>` —— 详情页里
  `#home` 是 `hidden` 的，原本整页没有 h1），返回时焦点还给入口那张卡片。
- **舞台是 `role="group"`**（原 `role="application"` 会让读屏进入应用模式、吞掉浏览键位）。
- **`totalIng` 只算一次**：从 `stateAt()`（每帧）挪到 `_buildSteps()`（构建时）。
- **每帧白写的属性也省了**：`render(t)` 每帧无条件复位并重写几十个 SVG 属性，但多数帧里值没变。
  现在所有属性/文本写入都走 `setAttr()` / `setText()`（记住上次值，相同就跳过）；静态节点
  引用（进度条/时间/播报）memo 一次，不再每帧 `querySelector`。改后逐帧比对过：
  12 杯全程 7292 帧、DOM 结果零差异。
- **已知（未修）**：`render(t)` 仍不算严格纯函数 —— 量酒器标签、容器阴影只在「当前步骤」里写、
  靠 `opacity` 掩盖历史残留，所以「拖回某时刻」与「一帧帧播过去」到同一时刻可能差一档阴影
  透明度。原先还有一处 `performance.now()` 凑的液面涟漪，v0.73.0 已换成阻尼振子解析响应
  （探针的「时刻纯度」判据守着这一项）。彻底纯化要把这些状态并进时间轴，记在 `BACKLOG.md` B1。

## 部署

由 BetterLife 自己服务，不需要额外的反向代理规则：

- `main.py`：`app.mount("/mine/bartending", StaticFiles(directory=BASE_DIR/"bartending", html=True))`
- `app/routes/pages.py`：`/mine/bartending`（无尾斜杠）**307 到 `/mine/bartending/`**
- Caddy 的 `handle /mine* { reverse_proxy 127.0.0.1:8080 }` 原样转发 `/mine` 前缀

### 相对路径（重要）

站内资源**全部是相对路径**（`css/style.css`、`js/*.js`）。所以页面**必须**从带尾斜杠的
地址打开，否则浏览器以 `/mine/` 为基准解析 → `/mine/css/style.css` = 404 → 白屏。

v0.66.3 就是栽在这上面：当时 `/mine/bartending` 直接返回 index.html（不重定向），
而 dashboard 导航用的正是这个无尾斜杠地址，于是脚本全丢、页面直接不可用。
现在 `pages.py` 里是无尾斜杠就 307，dashboard 的两个导航链接也直接写成带尾斜杠。

回归测试 `test_bartending_no_slash_redirects_so_relative_assets_resolve` 用
`follow_redirects=False` 断言重定向本身，并逐个取回页面里的**每一个**相对资源 ——
**以后加新资源不用改测试**，它会自动覆盖。

## 历史

上一版是复刻小红书「一杯之间」的橙色卡片风（从分享海报采样配色 + 半屏弹层，
`assets/cover.jpg`、`materials/*.jpg`、`materials-map.js`）。2026-10-07 按用户要求
整站废弃，换成现在这版「微醺星球」。
