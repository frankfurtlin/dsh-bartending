# 微醺星球 · 图片资产流水线

卡片图与详情页舞台背景都是**写实照片**（AI 生成），存腾讯云 COS、页面引用 EO 域名。
这里记的是：**为什么是 AI 生成**、**怎么生成**、**水印怎么定位裁切**、**换图怎么做**。
（站点自身说明见 `README.md`；后续可改的点见 `BACKLOG.md`。）

## 一、结论先行：为什么最后走 AI 生成

用户最初的要求是「去网上搜真实图片」。2026-10-14 在本机实测了一圈（换机器/换网络后
先跑 `python3 scripts/image_search.py probe "<关键词>"` 复核）：

| 目标 | 结果 |
|------|------|
| `api.openverse.org`（keyless、带许可元数据） | 不通（超时） |
| `commons.wikimedia.org`（Commons API） | 不通 |
| `pexels.com` 站点 / API | 403 |
| `unsplash.com` 站点 / `napi` 搜索接口 | 403 / 401（`web_fetch` 服务端抓同样被拒） |
| `source.unsplash.com`（老的无 key 接口） | 无响应 |
| `images.unsplash.com`、`images.pexels.com` | **通**，但没有可用的搜索入口（搜索 API 要 key） |
| `www.bing.com/images/search` → `cn.bing.com` | **通**，结果走异步端点 `/images/async`（首屏 HTML 里没有 `murl`） |
| Bing 缩略图缓存 `ts*.mm.bing.net` | 通 |
| 候选图原图（国内博客图床） | 一半 403，能下的也多是不同布光的随手拍 |

也就是说：**搜索这条路能走通，但产出的图不可用** —— 许可无法核对（Bing 的
`filterui:license-L2_L3_L4` 只是搜索引擎的声明）、分辨率与布光参差、`site:` 过滤被忽略。
用户认可后改走兜底：**AI 生成**（背景可指定纯黑、风格可统一、无版权风险）。

## 二、三条命令 = 整条流水线

| 环节 | 脚本 | 产出 |
|------|------|------|
| 选图（备用路径） | `scripts/image_search.py` | 带编号的接触表 + 候选清单 json，按编号下载原图 |
| 后处理 | `scripts/image_prep.py` | 定位水印 → 统一裁切 → 缩放到卡片尺寸的 JPEG |
| 上传 | `scripts/image_uploader.py` | COS 对象 + EO 域名 URL（供 `js/data.js` 的 `img` 字段用） |

```bash
# ① 选图（AI 生成不经过这一步；搜图或想让 AI 按真实参考图生成时用）
python3 scripts/image_search.py search "negroni cocktail glass dark background" -n 24
python3 scripts/image_search.py download /tmp/sheet_negroni-….json 3,7,11 -o /tmp/picks

# ② 后处理：先看水印在哪，再裁切压缩
python3 scripts/image_prep.py detect /tmp/raw/*.png
python3 scripts/image_prep.py crop   /tmp/raw/*.png -o /tmp/ready           # 卡片：640x400 q82
python3 scripts/image_prep.py crop   backdrop.png  -o /tmp/ready \
        --watermark none --size original                                   # 背景：不裁、保原尺寸

# ③ 上传
python3 scripts/image_uploader.py /tmp/ready/negroni.jpg
```

## 三、生图规范（12 张卡片图 + 1 张舞台背景）

> 说明：下面是可以**复现这套风格**的规范骨架，不是当初那次生成的逐字提示词（原始提示词没有留存）。

**卡片图（每杯一张，共 12 张）**

- 主体：单品鸡尾酒**完整入镜**（含杯脚/杯柄），水平居中；
- 背景：**纯黑无缝**，不要吧台、货架、道具等可辨识形状 —— 第一轮舞台背景里出现过货架，
  跟矢量瓶罐抢戏，重做过一次，别重蹈；
- 光：暖色轮廓光/背光勾边 + 杯口高光，酒液透光；
- 构图与一致性：主体占画面约 60–70%，**12 张用同一套「摄影棚 + 布光 + 镜头」描述**，
  只替换主体（杯型按配方：`coupe` / `martini` / `rocks` / `highball` / `wine`，酒色参考
  `data.js` 里的 `color`）；
- 不要文字、logo、人手、多余器具、可辨品牌瓶标；
- 出图尺寸 ≥ 1280×800（后面要裁掉右侧水印再缩到 640×400）。

**舞台背景（1 张）**：纯黑 + 暖色散景（虚焦光斑），**不要任何可辨形状**；保留 1280×800 不裁
（页面用 `center bottom / cover` 铺在 0.86→0.94 的暗幕之下，只留一点纵深）。

### 12 杯清单（与 `js/data.js` 一一对应）

| # | id | 中文名 | 杯型 | 酒色 | 卡片图 | 大小 |
|---|----|--------|------|------|--------|------|
| 1 | `margarita` | 玛格丽特 | coupe | `#dfe6c8` | `media/2026/10/e00e9bd9/margarita.jpg` | 22 KB |
| 2 | `mojito` | 莫吉托 | highball | `#cfe0a8` | `media/2026/10/e07a469e/mojito.jpg` | 29 KB |
| 3 | `negroni` | 尼格罗尼 | rocks | `#a5231d` | `media/2026/10/895cc83b/negroni.jpg` | 30 KB |
| 4 | `old-fashioned` | 古典鸡尾酒 | rocks | `#b06a25` | `media/2026/10/57e61751/old-fashioned.jpg` | 30 KB |
| 5 | `manhattan` | 曼哈顿 | coupe | `#9c4a2a` | `media/2026/10/fe936bf0/manhattan.jpg` | 21 KB |
| 6 | `martini` | 马天尼 | martini | `#e9efdd` | `media/2026/10/a41bbb27/martini.jpg` | 21 KB |
| 7 | `daiquiri` | 代基里 | coupe | `#e2e8c4` | `media/2026/10/6e95c4de/daiquiri.jpg` | 21 KB |
| 8 | `whisky-sour` | 威士忌酸 | rocks | `#e0a54a` | `media/2026/10/a308216a/whisky-sour.jpg` | 18 KB |
| 9 | `aperol-spritz` | 阿佩罗气泡酒 | wine | `#f08c2e` | `media/2026/10/083b77f4/aperol-spritz.jpg` | 36 KB |
| 10 | `long-island` | 长岛冰茶 | highball | `#8a4a1a` | `media/2026/10/461f3f20/long-island.jpg` | 30 KB |
| 11 | `cosmopolitan` | 大都会 | martini | `#e05a6e` | `media/2026/10/4e94f181/cosmopolitan.jpg` | 16 KB |
| 12 | `espresso-martini` | 意式浓缩马天尼 | coupe | `#4a2e1c` | `media/2026/10/f281cfee/espresso-martini.jpg` | 15 KB |
| — | （舞台背景） | — | — | — | `media/2026/10/b9d90ad6/stage-backdrop.jpg` | 28 KB |

卡片图合计 290 KB（平均 24 KB）+ 背景 28 KB。**URL 前缀** `https://static.frankfurtlin.top/`；
桶、密钥、区域全在仓库根 `.env` 的 `COS_*` 键里（`.env` 不进版本库，本文不复述）。

## 四、水印：定位、裁切、验证

出图右下角带「AI生成 / WORKBUDDY」水印。位置**不是猜的**，是量出来的：

1. **掩码**：像素满足「最小通道 ≥ 150（够亮）**且**通道极差 ≤ 48（不偏色）」即算水印 ——
   高光虽然亮但偏色（暖橙/冷蓝），白字水印三通道接近，这一条能把高光滤掉；
2. **取交集**：12 张各算一次掩码，再取**交集**（高光位置张张不同，交集会互相抵消），
   实测得 **x 1185–1271、y 752–791**，12 张完全一致；
3. **只裁右侧**：裁到 `x < 1171`（留 14 px 余量）。上下不裁 —— 水印纵坐标与杯脚区重叠，
   连上下一起裁会切到杯脚；而且 12 张用**同一个裁切窗口 + 同一套缩放**，卡片里杯子大小才一致。

裁完用 `ImageOps.fit` 做 **cover + 居中**（等比，不拉伸）：`1181×800 → 640×400`
（先按宽度缩到 640×434，再上下各切 17 px）。

**验证**（2026-10-14，成品图实测）：

- 12 张卡片图右边缘 8 px 条带**最亮 9**（0–255）→ 水印无残留；
- 背景图在同样位置**最亮 11**，与同高度左侧对照区（最亮 11）一致 → 本来就没有水印，故未裁。

`scripts/image_prep.py` 把上面这套固化了，并且**不钉死坐标**（重新检测，换一批图照用）：

```bash
python3 scripts/image_prep.py detect /tmp/raw/*.png     # 每张的框 + 交集 + 建议裁切线
python3 scripts/image_prep.py crop   /tmp/raw/*.png -o /tmp/ready
```

自检：裁切后若只剩源图 60% 以下宽度，脚本会**拒绝执行**并提示「像是水印检错了」
（确认无误才 `--force`）—— 检测一旦抓到整屏高光，静默裁掉半张图是最难查的那类错。

## 五、输出规格与页面侧

| 项 | 值 | 对齐的页面侧 |
|----|----|--------------|
| 卡片图 | 640×400 JPEG q82 | `.card-photo { aspect-ratio: 16 / 10 }` + `object-fit: cover` → **不会二次裁切**，12 张杯子大小一致 |
| 舞台背景 | 1280×800 JPEG | `.stage-wrap` 的 `center bottom / cover`，压在 0.86→0.94 暗幕之下 |
| 引用位置 | `js/data.js` 的 `img` 字段（12 处）+ `css/style.css` 的 `.stage-wrap`（1 处） | — |
| 加载失败 | `.card-photo.photo-failed` 露出原矢量小杯（`main.js` 的 `error` 监听） | 断网实测 12/12 回退，不留破图 |
| 合规标注 | 页脚「卡片图片由 AI 生成」 | `index.html` 的 `.footer-note` |

## 六、换图 SOP

**换某一张**（比如某杯重生成）：生成 → `image_prep.py crop 新图.png -o /tmp/ready`
→ **要和其余 11 张的裁切窗口一致**（脚本用同一批输入取交集；单独跑时用
`--watermark 1185,752,1272,792` 显式指定）→ 上传 → 把 URL 换进 `data.js` 的 `img`。
`key` 里含 sha1 前 8 位，**内容变了 key 就变**，所以旧对象不会自动被覆盖，确认新图上线后可清理旧对象。

**加一杯**：`data.js` 加配方（含 `img`）→ 卡片网格自动多一张 → 若新图风格与现有一致，
放进同一批重跑 `detect`/`crop` 拿交集；不一致就单独指定 `--watermark`。

**整批换**：把新原图放一个目录，`image_prep.py crop 目录 -o /tmp/ready` 一把跑完，
再 `for f in /tmp/ready/*.jpg; do python3 scripts/image_uploader.py "$f"; done`。

## 六点五、第二批素材（v0.74.0）：做法 / 配料 / 装饰 / 器材

用户第二轮要求：「做法配图还是矢量」「调酒动画不是正式的图」「配料也要真实的图」。
按确认口径：做法卡片改照片横幅、配料行改写实小图、舞台器材换贴图、装饰物一起做。
**载杯 / 量酒器 / 混合杯 / 摇壶 / 冰块仍保留矢量** —— 原因见本节「哪些留矢量」。

| 分组 | 张数 | 规格 | 用途 |
|------|------|------|------|
| `method_*` | 3 | 640×400 JPEG（有背景，水印裁右侧） | 三种做法卡片的顶部横幅 |
| `ing_*` | 22 | 透明底 WebP，高 256 | 配料行小图（38px）**与舞台架上酒瓶共用** |
| `gar_*` | 8 | 透明底 WebP，高 256 | 「装饰」那一行的小图 + 舞台上的装饰贴图 |
| `eq_*` | 3 | 透明底 WebP，高 256 | 舞台吧匙 / 捣棒（`eq_shaker` 没采用，见下） |

一共 36 张，道具 33 张合计 379 KB + 做法横幅 87 KB。

### 提示词（想重跑就照这个）

**有背景的照片**（做成 16:10 横幅，走 `crop`）：

```
Professional cocktail photography: <场景>, warm amber rim light, deep pure black seamless
background, moody dramatic lighting, no text, no watermark, no logo, centered composition,
shallow depth of field
```

三个场景分别是：`双手握不锈钢摇壶用力摇动、壶身结霜`、`长吧匙在混合杯里搅动、杯中有大冰块`
`把小瓶苏打水倒进装满冰的高球杯、细密气泡上涌`。

**要抠透明底的道具**（走 `key`）——关键是那句「纯白无缝底」，抠图的连通性判据全靠它：

```
Studio product photograph of <物件>, straight-on front view, centered on a flat pure white
seamless background, soft even diffuse studio lighting, subtle soft shadow beneath,
no text, no labels, no watermark, no hands, entire object visible with wide empty margin
around it, sharp focus
```

`<物件>` 按需替换（`one single unlabeled ... bottle`，装饰用 `a single ...`）：

| 键 | 配料 / 物件 | 键 | 配料 / 物件 |
|----|-------------|----|-------------|
| `tequila` | 高瘦透明瓶 + 金色龙舌兰 | `dry_vermouth` | 透明瓶 + 淡金干味美思 |
| `cointreau` | 矮圆肩瓶 + 鲜橙君度 | `lemon` | 细长瓶 + 浑浊淡黄柠檬汁 |
| `lime` | 细长瓶 + 淡绿浑浊青柠汁 | `aperol` | 透明瓶 + 亮橙阿佩罗 |
| `white_rum` | 短圆肩瓶 + 无色朗姆 | `prosecco` | 墨绿起泡酒瓶 + 银色瓶颈箔 |
| `soda` | 透明苏打水瓶 + 金属皇冠盖、细气泡 | `vodka` | 高瘦透明瓶 + 无色 |
| `gin` | 高方肩透明瓶 + 无色 | `cola` | 深棕玻璃瓶 + 金属盖、深焦糖色 |
| `campari` | 透明瓶 + 深宝石红 | `citron_vodka` | 细长透明瓶 + 极淡柠檬色 |
| `sweet_vermouth` | 略矮透明瓶 + 深琥珀 | `cranberry` | 透明瓶 + 深红蔓越莓汁 |
| `bourbon` | 方肩威士忌瓶 + 浓郁琥珀 | `coffee_liqueur` | 透明瓶 + 极深棕咖啡利口酒 |
| `sugar_syrup` | 小糖浆瓶 + 细金属倾倒嘴、浓稠透明 | `espresso` | 小玻璃瓶 + 深褐浓缩 |
| `angostura` | 小琥珀瓶 + 黑色滴管盖、深褐 | `rye` | 透明威士忌瓶 + 深橙琥珀 |

装饰：`青柠轮片` / `柠檬轮片` / `橙轮片`（`a single thin round ... slice wheel cut, slight
three-quarter angle`）、`橙皮卷` / `柠檬皮卷`（`a single curled strip of ... peel, skin facing
outward`）、`薄荷枝`（`a small fresh green mint sprig`）、`樱桃`（`a single glossy bright red
candied cocktail cherry with a thin green stem`）、`咖啡豆`（`three dark roasted whole coffee beans`）。
器材：`吧匙`（`a long stainless steel bar spoon, thin twisted stem, bowl at the bottom, perfectly
vertical`）、`捣棒`（`a wooden cocktail muddler, rounded flat head at the bottom, vertical`）——
**竖构图是刻意的**，舞台贴图按「底边中点 / 中心」定位，竖图才好旋到吧匙的连线上。

### 抠白底（`key`）的三个实测坑

1. **背景必须真平**。整批白底实测 239–242，而个别出图带渐晕（`ing_tequila`、`ing_white_rum`）：
   渐晕区与物体连通、又超出容差，于是整块留下来、bbox 被撑到整幅。对策：`--tol 35`（tequila）
   或重生成一次并在提示词里写明 `no vignette, no grey gradient`（white_rum）。
2. **命名要按目录**。生成工具给的文件名带时间戳，不同目录会撞名 —— 33 张只落下 28 个文件。
   `--name dir` 用目录名（`ing_tequila` 等）命名，这才对上语义。
3. **并行生成会撞车**。同一秒落盘的两张可能**字节完全相同**（实测 33 张里查出 4 处重复：
   `ing_tequila`/`_method_build`、`gar_mint`/`gar_orange_peel`/`gar_lemon_twist`、
   `ing_espresso`/`eq_shaker`）。对策：每批不超过 4 张，落盘后**逐个查 sha1 去重**再往下走。

### 哪些留矢量，为什么

| 件 | 为什么不能贴图 |
|----|----------------|
| 载杯 / 量酒器 / 混合杯 / 摇壶 | 内部都有 `clip-path` 驱动的**液体高度动画**（倒酒时涨、滤酒时降），贴图会丢掉这个状态 |
| 冰块 | 透明物体：白底抠图会把主体一起抠掉，黑底 + screen 混合又会让它发光失真；26px 的矢量冰块够用 |
| `eq_shaker` 出图 | 生成的那张更像**玻璃罐**（里面还有深色液体），与金属摇壶不符，故未采用（文件在 COS 上，可删） |

贴图与矢量件放在**同一个 group**、按同一套坐标摆（瓶子底边中点对齐 group 原点、盒子高
`mouthY + 8`，装饰件居中），所以**倒酒出口、晃动锚点、投影位置都没变**。
代价：原先写在瓶身上的小标签不再显示（照片瓶更窄，38px 的白标签会宽出瓶身）——
用量提示仍由倒酒时的浮动标签给出（「金酒 · 25 ml」）。

降级链路（全部实测过）：配料图挂 → 露出色块；做法图挂 → 露出线稿；舞台贴图挂 → 摘掉 `<image>`、
露出矢量件。

## 七、边界与合规

- **AI 生成**：页面已显式标注（页脚），别再往站里加未标注的 AI 图；
- **桶是公开读**：拿到 URL 的人都能访问，往 `media/` 放东西前先确认不含隐私内容
  （报告配图同理，见 `scripts/image_uploader.py` 的说明）；
- **搜图只作参考**：`image_search.py` 是省事的入口，不是许可证明。真要采用外部图，
  必须回到来源页核对许可与署名要求，拿不准就退回 AI 生成；
- **图片不进仓库**：站点源码（`index.html` + `css/` + `js/`，约 159 KB）里没有位图，图全在 COS ——
  代价是无网时不显示（有矢量小杯兜底），换图必须联网上传。
