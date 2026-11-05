/* 微醺星球 · 调酒动画引擎
 * 场景完全由 SVG 构成，render(t) 是时间 t 的纯函数 ——
 * 因此拖动进度条可以精确回放任意时刻的画面。
 */
'use strict';

(function (global) {

  const SVGNS = 'http://www.w3.org/2000/svg';
  const W = 960, H = 560, TABLE = 520, SHELF = 172;

  /* ---------- 基础工具 ---------- */
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) setAttr(n, k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  /* ---------- 属性 / 文本写入缓存（v0.72.0） ----------
     render(t) 每帧都要复位并重写几十个 SVG 属性（复位段 + _resetFX + _setLiquid 各来一遍），
     但绝大多数帧里这些值根本没变 —— 白写的 setAttribute 每次都会让引擎做一遍样式失效判定。
     这里记住「每个元素每个属性的上次写入值」，值一样就跳过；因为是同一个纯函数算出来的值，
     画面结果完全一致，省掉的是纯粹的重复劳动。
     约定：同一个元素的同一个属性，**要么全走 setAttr、要么全不走** —— 混用会让缓存读到过期值。 */
  const _attrCache = new WeakMap();
  function setAttr(n, name, value) {
    value = String(value);
    let m = _attrCache.get(n);
    if (m === undefined) { m = {}; _attrCache.set(n, m); }
    if (m[name] === value) return;
    m[name] = value;
    n.setAttribute(name, value);   /* 唯一的真实写入点：缓存命中时走不到这里 */
  }
  const _textCache = new WeakMap();
  function setText(n, value) {
    if (_textCache.get(n) === value) return;
    _textCache.set(n, value);
    n.textContent = value;
  }

  /* ---------- 写实贴图（v0.74.0） ----------
     酒瓶 / 吧匙 / 捣棒 / 装饰换成透明底写实图（生成与抠底流程见 app/domains/bartending/ASSETS.md），
     程序化矢量件保留为**回退**：图加载失败（离线 / 被墙 / 图被删）就露出来，不留空位。
     贴图与矢量件放在**同一个 group**、按同一套坐标摆（底边中点或中心对齐），于是倒酒出口
     （瓶子 mouthY）、晃动锚点、投影位置全都不用改 —— 物理与时间轴一行没动。
     用 onload/onerror **属性**而不是 addEventListener：探针的桩 DOM 只实现了 setAttribute，
     属性赋值是它的自然扩展，桩里永远不会触发，也就不会误伤探针。

     box 只是个「容器」：SVG 的 <image> **没有** naturalWidth/naturalHeight（那是 HTMLImageElement
     的属性），拿不到真实宽高比，所以靠 preserveAspectRatio 的 meet 让它按自身比例装进盒子
     （默认底边中点对齐、横向居中；装饰件传 xMidYMid 就是居中）—— 效果与手动算宽度一样，
     且不会被拉伸。盒子给得比贴图宽是刻意的：装进去之后左右留白，位置由对齐方式决定。 */
  function useSprite(group, url, box, vec, align) {
    if (!url) return null;
    const im = el('image', {
      href: url, x: box[0], y: box[1], width: box[2], height: box[3],
      preserveAspectRatio: align || 'xMidYMax meet', opacity: 0
    }, group);
    im.onload = function () {
      setAttr(this, 'opacity', 1);
      if (vec) setAttr(vec, 'opacity', 0);
    };
    im.onerror = function () {     /* 加载失败 → 摘掉自己，把位置让给矢量件 */
      if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this);
    };
    return im;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function phase(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
  function easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(r, g, b) {
    const f = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function mixTwo(c1, c2, tt) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return rgb2hex(lerp(a[0], b[0], tt), lerp(a[1], b[1], tt), lerp(a[2], b[2], tt));
  }
  function mixColors(parts) {
    if (!parts.length) return '#cccccc';
    let r = 0, g = 0, b = 0, tm = 0;
    for (const p of parts) {
      const c = hex2rgb(p.color);
      r += c[0] * p.ml; g += c[1] * p.ml; b += c[2] * p.ml; tm += p.ml;
    }
    if (tm <= 0) return '#cccccc';
    return rgb2hex(r / tm, g / tm, b / tm);
  }
  function lighten(hex, amt) {
    const c = hex2rgb(hex);
    return rgb2hex(c[0] + (255 - c[0]) * amt, c[1] + (255 - c[1]) * amt, c[2] + (255 - c[2]) * amt);
  }
  function rot(px, py, cx, cy, deg) {
    const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const dx = px - cx, dy = py - cy;
    return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
  }

  /* ---------- 物理（v0.72.0 二轮）----------
     原先的运动是「正弦 + 缓动凑」出来的：摇壶用 sin(p*36)、落冰用 easeOutCubic 直接插值到目标点、
     液流是写死控制点的贝塞尔。这里换成真的力学。场景单位是像素，按载杯高 ≈ 100 mm 折算，
     1 m ≈ 1000 px，于是 g = 9.8 m/s² ≈ 9800 px/s²。 */
  const GRAV = 9800;
  const SLOSH_ZETA = 0.12;            /* 液面晃动阻尼比：小的液体阻尼，晃几下就静下来 */
  /* 液膜越过瓶口/壶口时的溢出速度：托里拆利 v = √(2gh)，取液膜压头 h ≈ 5 px（≈310 px/s）。
     倒酒的出口速度量级就是这个，手挥动的速度再叠加上去。 */
  const DRIBBLE = Math.sqrt(2 * GRAV * 5);
  /* 杯壁收放系数 k（A(h) ∝ (1+k·h)²）：直筒≈0，V 形马天尼最大。
     V 形杯底窄口宽 —— 少量酒就涨得高，越接近杯口反而涨得越慢，所以液位不能按体积线性拍脑袋。 */
  const GLASS_TAPER = { rocks: 0.12, highball: 0.06, coupe: 0.85, martini: 1.6, wine: 0.7 };

  /* 抛射：给定初位置与初速度（px、px/s），t 秒后的位置 */
  function projAt(p0, v0, t) {
    return { x: p0.x + v0.x * t, y: p0.y + v0.y * t + 0.5 * GRAV * t * t };
  }
  /* 自由落体落到 y = yTarget 所需时间：解 0.5g t² + v0y t + (y0 - yT) = 0，取最小正根 */
  function fallTime(p0y, v0y, yTarget) {
    const A = 0.5 * GRAV, B = v0y, C = p0y - yTarget;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-B - s) / (2 * A), t2 = (-B + s) / (2 * A);
    const ts = [t1, t2].filter(t => t > 0).sort((a, b) => a - b);
    return ts.length ? ts[0] : null;
  }
  /* 液面晃动：单自由度阻尼振子对「一瞬间的扰动」的解析冲量响应
       θ(t) = (J/ω_d)·e^(-ζω₀t)·sin(ω_d t)，ω₀ = √(g/L) —— 液层越浅晃得越快。
     冲量 J 来自液流砸到液面时的动量，所以倒得越猛、晃得越大，之后自己衰减掉。 */
  function sloshImpulse(depth, ml, impactSpeed) {
    const om = Math.sqrt(GRAV / Math.max(24, depth));
    const j = (ml * 0.001) * impactSpeed * 0.0009;     /* 质量→角速度的量纲折算 */
    return { om: om, j: clamp(j, 0, 0.14) };
  }
  function sloshAngle(om, j, t) {
    if (t <= 0) return 0;
    const wd = om * Math.sqrt(1 - SLOSH_ZETA * SLOSH_ZETA);
    return (j / wd) * Math.exp(-SLOSH_ZETA * om * t) * Math.sin(wd * t);
  }
  /* 体积 → 液位：杯子不是直筒，截面随高度变化，所以「等量液体在不同杯型里涨得不一样快」。
     侧壁用「底宽→口宽」线性渐变近似 A(h) ∝ (1 + k·h)²，再解 ∫A dh = V。 */
  function levelFromVolume(volML, capML, maxFrac, taper) {
    const V = clamp(volML / Math.max(1, capML), 0, 1);
    const k = taper === undefined ? 0.3 : taper;
    const target = V * (1 + k + k * k / 3);
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const h = (lo + hi) / 2;
      const f = h + k * h * h + k * k * h * h * h / 3;
      if (f < target) lo = h; else hi = h;
    }
    return ((lo + hi) / 2) * maxFrac;
  }
  /* 沿轨迹的速度大小 → 液柱宽度：连续性方程 Q = A·v 恒定，所以 v 越大液柱越细 */
  function streamWidth(w0, speed, v0speed) {
    return clamp(w0 * Math.sqrt(Math.max(1, v0speed) / Math.max(1, speed)), w0 * 0.35, w0 * 1.15);
  }

  /* ---------- 烘焙仿真（第二批） ----------
     碰撞、回弹、最终静止这些是**有状态**的，写不成 t 的闭式解；但时间轴必须能精确擦洗，
     所以在建场景时按固定步长把每段步骤先跑一遍，把轨迹烘成数组，render(t) 只做插值采样。
     步长 1/120 s：一段摇和 3 s 也就 360 步，构建开销在毫秒级。
     随机量一律用固定种子的伪随机（不用 Math.random）—— 同一杯酒每次打开画面完全一致。 */
  const PHYS_DT = 1 / 120;
  function fixedRand(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  /* 二阶中心差分求加速度；**边界必须用同阶的前向/后向差分** ——
     否则 i=0 会退化成 (x[1]-x[0])/dt²，把伪力放大成约 1/dt 倍（冰会被凭空甩出去）。 */
  function accelAt(arr, i, n) {
    const dt2 = PHYS_DT * PHYS_DT;
    if (i === 0) return (arr[2] - 2 * arr[1] + arr[0]) / dt2;
    if (i >= n - 1) return (arr[n - 1] - 2 * arr[n - 2] + arr[n - 3]) / dt2;
    return (arr[i + 1] - 2 * arr[i] + arr[i - 1]) / dt2;
  }
  function trackAt(arr, t) {                       /* 按时间在烘焙轨迹上线性插值 */
    if (!arr || !arr.length) return 0;
    const f = clamp(t / PHYS_DT, 0, arr.length - 1);
    const i = Math.floor(f), k = f - i;
    return i + 1 < arr.length ? arr[i] * (1 - k) + arr[i + 1] * k : arr[arr.length - 1];
  }

  /* ---------- 瓶子 ---------- */
  const GLASS_FILL = 'rgba(255,255,255,0.07)';
  const GLASS_STROKE = 'rgba(230,240,250,0.55)';
  const CAP = '#8b95a6';

  function buildBottle(ing, parent) {
    const g = el('g', { class: 'bottle' }, parent);
    /* 矢量瓶身放进内层 group：写实贴图加载成功就整体隐藏它（回退用） */
    const vec = el('g', {}, g);
    const col = ing.color, sh = ing.shape;
    let mouthY;
    const body = (w, h, x, y, rx) => el('rect', { x: x, y: y, width: w, height: h, rx: rx || 5, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
    if (sh === 'spirit') {
      mouthY = 112;
      body(42, 68, -21, -68);
      el('path', { d: 'M -21 -68 L -9 -88 L -9 -100 L 9 -100 L 9 -88 L 21 -68 Z', fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -18, y: -60, width: 36, height: 58, rx: 3, fill: col, opacity: 0.62 }, vec);
      el('rect', { x: -10, y: -112, width: 20, height: 13, rx: 2, fill: CAP }, vec);
    } else if (sh === 'liqueur') {
      mouthY = 98;
      el('rect', { x: -21, y: -78, width: 42, height: 78, rx: 15, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -18, y: -54, width: 36, height: 51, rx: 12, fill: col, opacity: 0.62 }, vec);
      el('rect', { x: -7, y: -92, width: 14, height: 16, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -8, y: -102, width: 16, height: 11, rx: 2, fill: CAP }, vec);
      mouthY = 102;
    } else if (sh === 'wine') {
      mouthY = 116;
      el('rect', { x: -13, y: -92, width: 26, height: 92, rx: 8, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('path', { d: 'M -13 -92 L -6 -108 L 6 -108 L 13 -92 Z', fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -10, y: -72, width: 20, height: 70, rx: 6, fill: col, opacity: 0.62 }, vec);
      el('rect', { x: -7, y: -116, width: 14, height: 9, rx: 2, fill: '#b0895a' }, vec);
    } else if (sh === 'juice') {
      mouthY = 94;
      body(46, 70, -23, -70);
      el('rect', { x: -20, y: -48, width: 40, height: 45, rx: 4, fill: col, opacity: 0.62 }, vec);
      el('rect', { x: -8, y: -84, width: 16, height: 15, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -9, y: -94, width: 18, height: 11, rx: 2, fill: CAP }, vec);
    } else if (sh === 'syrup') {
      mouthY = 76;
      el('rect', { x: -23, y: -54, width: 46, height: 54, rx: 11, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -20, y: -38, width: 40, height: 35, rx: 8, fill: col, opacity: 0.72 }, vec);
      el('rect', { x: -7, y: -66, width: 14, height: 13, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -8, y: -76, width: 16, height: 11, rx: 2, fill: CAP }, vec);
    } else if (sh === 'bitters') {
      mouthY = 64;
      el('rect', { x: -13, y: -44, width: 26, height: 44, rx: 4, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -10, y: -30, width: 20, height: 28, rx: 3, fill: col, opacity: 0.72 }, vec);
      el('rect', { x: -5, y: -56, width: 10, height: 13, fill: '#5a4632' }, vec);
      el('rect', { x: -3.5, y: -64, width: 7, height: 9, fill: '#5a4632' }, vec);
    } else if (sh === 'soda') {
      mouthY = 104;
      el('rect', { x: -16, y: -80, width: 32, height: 80, rx: 13, fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('rect', { x: -13, y: -58, width: 26, height: 55, rx: 10, fill: col, opacity: 0.62 }, vec);
      el('rect', { x: -4, y: -94, width: 8, height: 15, rx: 3, fill: '#9aa6b8' }, vec);
      el('circle', { cx: 0, cy: -100, r: 6.5, fill: '#9aa6b8' }, vec);
    } else { /* pitcher（浓缩咖啡壶） */
      mouthY = 56;
      el('path', { d: 'M -18 -44 L 18 -44 L 13 0 L -13 0 Z', fill: GLASS_FILL, stroke: GLASS_STROKE, 'stroke-width': 1.4 }, vec);
      el('path', { d: 'M -18 -44 L -26 -38 L -18 -34 Z', fill: GLASS_STROKE }, vec);
      el('path', { d: 'M 16 -36 Q 30 -30 22 -12', fill: 'none', stroke: GLASS_STROKE, 'stroke-width': 3.4, 'stroke-linecap': 'round' }, vec);
      el('path', { d: 'M -15 -36 L 15 -36 L 11 -3 L -11 -3 Z', fill: col, opacity: 0.72 }, vec);
      el('rect', { x: -18, y: -49, width: 36, height: 5, rx: 2, fill: '#9aa6b8' }, vec);
    }
    /* 瓶身标签：写上材料名，一眼看懂在倒什么 */
    const labelName = (ing && ing.name ? ing.name : '').slice(0, 5);
    const labelPos = { spirit: -50, liqueur: -52, wine: -66, juice: -48, syrup: -40, soda: -54 }[sh];
    if (labelName && labelPos !== undefined) {
      const lw = sh === 'wine' ? 24 : 38;
      const fs = sh === 'wine' ? 7 : (labelName.length > 4 ? 7.2 : 8.5);
      el('rect', {
        x: -lw / 2, y: labelPos, width: lw, height: 15, rx: 2.5,
        fill: '#f7f3e8', stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.8, opacity: 0.96
      }, vec);
      const txt = el('text', {
        x: 0, y: labelPos + 7.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: '#3a3328',
        style: `font:600 ${fs}px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif`
      }, vec);
      txt.textContent = labelName;
    }
    el('ellipse', { cx: 0, cy: 2, rx: 26, ry: 4, fill: 'rgba(0,0,0,0.4)' }, vec);
    /* 写实贴图：底边中点对齐 group 原点（= 矢量瓶的瓶底），盒子高 mouthY + 8 →
       瓶口仍在 (0, -mouthY) 一带，倒酒出口位置一点没变 */
    useSprite(g, assetUrl('ing', ing && ing.name), [-50, -mouthY - 8, 100, mouthY + 8], vec);
    return { node: g, mouthY: mouthY, ing: ing };
  }

  /* ---------- 冰块 ---------- */
  function makeCube(parent) {
    const g = el('g', {}, parent);
    el('rect', { x: -13, y: -13, width: 26, height: 26, rx: 6, fill: 'rgba(215,232,248,0.38)', stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 1.4 }, g);
    el('rect', { x: -7, y: -8, width: 8, height: 6, rx: 2, fill: 'rgba(255,255,255,0.45)' }, g);
    return g;
  }

  /* ---------- 装饰物 ---------- */
  function buildGarnish(type, parent) {
    const g = el('g', { class: 'garnish' }, parent);
    const vec = el('g', {}, g);          /* 矢量装饰（回退） */
    const wheel = (c1, c2) => {
      el('circle', { r: 15, fill: c1, stroke: c2, 'stroke-width': 1.6 }, vec);
      el('circle', { r: 11.5, fill: c2 }, vec);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        el('line', { x1: Math.cos(a) * 2, y1: Math.sin(a) * 2, x2: Math.cos(a) * 11, y2: Math.sin(a) * 11, stroke: '#ffffff', 'stroke-width': 1.1, opacity: 0.75 }, vec);
      }
    };
    const peel = (c1, c2) => {
      el('path', { d: 'M -14 8 C -8 -10 6 -14 15 -4 C 8 -10 -2 -4 -8 10 Z', fill: c1, stroke: c2, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, vec);
    };
    switch (type) {
      case 'lime-wheel': wheel('#a8cf6e', '#dff0c0'); break;
      case 'lemon-slice': wheel('#e3d75e', '#f6f0bc'); break;
      case 'orange-slice': wheel('#f0923c', '#f8d8ab'); break;
      case 'orange-peel': peel('#f0923c', '#c96f1f'); break;
      case 'lemon-twist': peel('#e8dd6e', '#b8a83a'); break;
      case 'mint':
        el('line', { x1: 0, y1: 16, x2: 0, y2: -6, stroke: '#4a7c30', 'stroke-width': 2 }, vec);
        [[0, -14, 0], [-8, -8, -40], [8, -8, 40], [-7, 0, -60], [7, 0, 60]].forEach(p => {
          el('ellipse', { cx: p[0], cy: p[1], rx: 6, ry: 3.4, fill: '#4f9450', stroke: '#356e38', 'stroke-width': 1, transform: `rotate(${p[2]} ${p[0]} ${p[1]})` }, vec);
        });
        break;
      case 'cherry':
        el('path', { d: 'M 2 -8 Q 8 -18 14 -20', fill: 'none', stroke: '#4a7c30', 'stroke-width': 2, 'stroke-linecap': 'round' }, vec);
        el('circle', { cx: 0, cy: 2, r: 8.5, fill: '#c2273d', stroke: '#8e1630', 'stroke-width': 1.4 }, vec);
        el('circle', { cx: -2.5, cy: -0.5, r: 2.4, fill: 'rgba(255,255,255,0.55)' }, vec);
        break;
      case 'coffee-beans':
        [[-9, 2, -30], [8, -4, 20], [2, 8, 70]].forEach(p => {
          el('ellipse', { cx: p[0], cy: p[1], rx: 5.2, ry: 3.6, fill: '#2f1a10', stroke: '#1a0d07', 'stroke-width': 1, transform: `rotate(${p[2]} ${p[0]} ${p[1]})` }, vec);
          el('line', { x1: p[0] - 3, y1: p[1], x2: p[0] + 3, y2: p[1], stroke: '#1a0d07', 'stroke-width': 1, transform: `rotate(${p[2]} ${p[0]} ${p[1]})` }, vec);
        });
        break;
    }
    /* 写实贴图：以 group 原点为中心（矢量装饰同样绕原点画），盒子按最大直径 34 给 */
    useSprite(g, assetUrl('gar', type), [-20, -20, 40, 40], vec, 'xMidYMid meet');
    return g;
  }

  /* ---------- 量酒器 ---------- */
  function buildJigger(svg, defs, x) {
    const g = el('g', { class: 'jigger', opacity: 0 }, svg);
    el('path', { d: `M ${x - 21} 466 L ${x + 21} 466 L ${x + 14} 512 L ${x - 14} 512 Z`, fill: 'url(#st-metal)', stroke: 'rgba(255,255,255,0.4)', 'stroke-width': 1.2 }, g);
    const clipId = 'st-clip-jigger';
    const cp = el('clipPath', { id: clipId }, defs);
    el('path', { d: `M ${x - 17} 470 L ${x + 17} 470 L ${x + 11} 508 L ${x - 11} 508 Z` }, cp);
    const fillRect = el('rect', { x: x - 18, y: 508, width: 36, height: 0, fill: '#e8a54b', opacity: 0.85, 'clip-path': `url(#${clipId})` }, g);
    el('rect', { x: x - 4, y: 468, width: 3, height: 40, rx: 1.5, fill: 'rgba(255,255,255,0.45)' }, g);
    const label = el('text', { x: x, y: 452, 'text-anchor': 'middle', class: 'jigger-label' }, svg);
    label.textContent = '0 ml';
    return { node: g, fill: fillRect, label: label, x: x };
  }

  /* ---------- 舞台 ---------- */
  const STEP_DUR = {
    muddle: 2.8, ice: 1.8, shake: 3.0, stir: 2.6, stirGlass: 2.4,
    top: 2.4, strain: 3.0, garnish: 2.0, finish: 2.6
  };

  function Stage(cocktail, host) {
    this.c = cocktail;
    this.mode = cocktail.method; /* shake | stir | build */
    this.build = this.mode === 'build';
    this.vx = 320;
    this.gx = this.build ? 470 : 680;
    this.steps = [];
    this.times = [];
    this.topEnd = -1;
    this._buildDOM(host);
    this._buildSteps();
  }

  Stage.prototype._buildDOM = function (host) {
    host.innerHTML = '';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'stage-svg', 'aria-hidden': 'true' });
    host.appendChild(svg);
    this.svg = svg;

    /* defs */
    const defs = el('defs', {}, svg);
    const metal = el('linearGradient', { id: 'st-metal', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#dfe5ef' }, metal);
    el('stop', { offset: '50%', 'stop-color': '#b7c1d4' }, metal);
    el('stop', { offset: '100%', 'stop-color': '#96a1b8' }, metal);
    /* 酒液高光渐变：顶部亮、向下消失，营造液体质感 */
    const liqGrad = el('linearGradient', { id: 'st-liq', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.32 }, liqGrad);
    el('stop', { offset: '40%', 'stop-color': '#ffffff', 'stop-opacity': 0.08 }, liqGrad);
    el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, liqGrad);
    /* ---- 材质用的渐变（第二批 3/3）----
       全部用渐变实现，**不用 SVG 滤镜**：滤镜会让浏览器每帧重算模糊，低端机上代价很高。 */
    const shadowG = el('radialGradient', { id: 'st-shadow' }, defs);              /* 柔影：中心浓、边缘散 */
    el('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': 0.55 }, shadowG);
    el('stop', { offset: '52%', 'stop-color': '#000000', 'stop-opacity': 0.26 }, shadowG);
    el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': 0 }, shadowG);
    const fogG = el('linearGradient', { id: 'st-fog', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);   /* 背景雾（景深） */
    el('stop', { offset: '0%', 'stop-color': '#0b0e15', 'stop-opacity': 0.55 }, fogG);
    el('stop', { offset: '55%', 'stop-color': '#0b0e15', 'stop-opacity': 0.18 }, fogG);
    el('stop', { offset: '100%', 'stop-color': '#0b0e15', 'stop-opacity': 0 }, fogG);
    const hlG = el('linearGradient', { id: 'st-hl', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);      /* 玻璃高光条 */
    el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.03 }, hlG);
    el('stop', { offset: '34%', 'stop-color': '#ffffff', 'stop-opacity': 0.30 }, hlG);
    el('stop', { offset: '72%', 'stop-color': '#ffffff', 'stop-opacity': 0.05 }, hlG);
    el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, hlG);
    const refrG = el('linearGradient', { id: 'st-refr', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);  /* 折射带 */
    el('stop', { offset: '0%', 'stop-color': '#dff0ff', 'stop-opacity': 0.16 }, refrG);
    el('stop', { offset: '60%', 'stop-color': '#ffffff', 'stop-opacity': 0.05 }, refrG);
    el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, refrG);
    const vigG = el('radialGradient', { id: 'st-vig', cx: '50%', cy: '44%', r: '74%' }, defs);        /* 暗角 */
    el('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': 0 }, vigG);
    el('stop', { offset: '60%', 'stop-color': '#000000', 'stop-opacity': 0.07 }, vigG);
    el('stop', { offset: '100%', 'stop-color': '#000000', 'stop-opacity': 0.6 }, vigG);

    /* 桌面与提示 */
    el('line', { x1: 30, y1: TABLE, x2: 930, y2: TABLE, stroke: 'rgba(240,235,220,0.13)', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    /* 柔影：径向渐变代替硬边椭圆（物体升高时影子会变大变淡 —— 见摇和分支） */
    el('ellipse', { cx: this.gx, cy: TABLE + 3, rx: 86, ry: 13, fill: 'url(#st-shadow)' }, svg);
    if (!this.build) this.vesselShadow = el('ellipse', { cx: this.vx, cy: TABLE + 3, rx: 78, ry: 12, fill: 'url(#st-shadow)' }, svg);
    this.hint = el('text', { x: W / 2, y: 40, 'text-anchor': 'middle', class: 'stage-hint' }, svg);

    /* 瓶子排 */
    const ings = this.c.ingredients;
    const n = ings.length;
    const cx = this.build ? 470 : 300;
    const spacing = n > 1 ? Math.min(this.build ? 100 : 84, (this.build ? 760 : 430) / (n - 1)) : 0;
    this.bottles = [];
    const x0 = cx - (n - 1) / 2 * spacing;
    if (n > 0) {
      el('line', {
        x1: x0 - 34, y1: SHELF, x2: x0 + (n - 1) * spacing + 34, y2: SHELF,
        stroke: 'rgba(240,235,220,0.1)', 'stroke-width': 2, 'stroke-linecap': 'round'
      }, svg);
    }
    const targetX = this.build ? this.gx : this.vx;
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * spacing;
      const b = buildBottle(ings[i], svg);
      b.bx = bx;
      b.dir = targetX >= bx ? 1 : -1;
      setAttr(b.node, 'transform', `translate(${bx},${SHELF})`);
      this.bottles.push(b);
    }

    /* 背景雾：给远景（架子与瓶子）压一层向下渐隐的雾，做出景深 —— 比模糊滤镜便宜得多 */
    el('rect', { x: -40, y: -40, width: W + 80, height: 380, fill: 'url(#st-fog)', 'pointer-events': 'none' }, svg);

    /* 量酒器 */
    const jx = this.build ? 648 : 508;
    this.jigger = buildJigger(svg, defs, jx);
    this.pourTargetX = jx;

    /* 混合容器（摇壶 / 混合杯） */
    if (!this.build) {
      const vg = el('g', {}, svg);
      const tilt = el('g', {}, vg);
      this.vessel = { root: vg, tilt: tilt, isShaker: this.mode === 'shake' };
      const x = this.vx;
      if (this.mode === 'shake') {
        el('path', { d: `M ${x - 48} 372 L ${x + 48} 372 L ${x + 38} 512 Q ${x} 520 ${x - 38} 512 Z`, fill: 'url(#st-metal)', stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1 }, tilt);
        el('rect', { x: x - 27, y: 382, width: 9, height: 118, rx: 4, fill: 'rgba(255,255,255,0.35)' }, tilt);
        el('line', { x1: x - 48, y1: 372, x2: x + 48, y2: 372, stroke: 'rgba(30,36,48,0.5)', 'stroke-width': 5, 'stroke-linecap': 'round' }, tilt);
      } else {
        el('path', { d: `M ${x - 50} 376 L ${x + 50} 376 L ${x + 40} 512 L ${x - 40} 512 Z`, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(230,240,250,0.5)', 'stroke-width': 2 }, tilt);
        el('line', { x1: x - 40, y1: 504, x2: x + 40, y2: 504, stroke: 'rgba(230,240,250,0.4)', 'stroke-width': 4, 'stroke-linecap': 'round' }, tilt);
      }
      const clipId = 'st-clip-vessel';
      const cp = el('clipPath', { id: clipId }, defs);
      const inset = this.mode === 'shake'
        ? `M ${x - 42} 376 L ${x + 42} 376 L ${x + 33} 508 Q ${x} 515 ${x - 33} 508 Z`
        : `M ${x - 44} 380 L ${x + 44} 380 L ${x + 35} 508 L ${x - 35} 508 Z`;
      el('path', { d: inset }, cp);
      this.vessel.liquid = el('rect', { x: x - 46, y: 508, width: 92, height: 0, 'clip-path': `url(#${clipId})`, opacity: 0.92 }, tilt);
      this.vessel.shine = el('rect', { x: x - 46, y: 508, width: 92, height: 0, 'clip-path': `url(#${clipId})`, fill: 'url(#st-liq)' }, tilt);
      this.vessel.veil = el('rect', { x: x - 46, y: 508, width: 92, height: 0, 'clip-path': `url(#${clipId})`, fill: '#ffffff', opacity: 0 }, tilt);
      this.vessel.surface = el('ellipse', {
        cx: x, cy: 508, rx: 30, ry: 5, fill: '#ffffff', opacity: 0,
        stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 0.9
      }, tilt);
      this.vessel.botY = 508;
      this.vessel.liqH = 124;
      this.vessel.surfW = 58;
      /* 冰块（属于容器，会跟着倾斜/摇动） */
      this.vesselCubes = [];
      const slots = [[x - 14, 468, -10], [x + 13, 484, 12], [x + 1, 448, 18]];
      for (const s of slots) {
        const cube = makeCube(tilt);
        setAttr(cube, 'transform', `translate(${s[0]},${s[1]}) rotate(${s[2]})`);
        setAttr(cube, 'opacity', 0);
        this.vesselCubes.push({ node: cube, slot: s });
      }
      /* 摇和动态线 */
      this.streaks = [];
      for (const d of [-1, 1]) {
        const p = el('path', {
          d: `M ${x + d * 66} 402 q ${d * 16} 28 0 58`, fill: 'none',
          stroke: 'rgba(207,214,228,0.8)', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0
        }, svg);
        this.streaks.push(p);
      }
    }

    /* 载杯 */
    const glassDef = this._buildGlass(svg, defs);
    this.glassDef = glassDef;

    /* 每杯专属的特色动画元素 */
    this._buildFX(svg, defs);

    /* 吧匙（碗圆缓存，避免每帧查询） */
    this.spoon = el('g', { opacity: 0 }, svg);
    this.spoonVec = el('g', {}, this.spoon);            /* 矢量吧匙（回退） */
    this.spoonLine = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: '#cfd6e4', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, this.spoonVec);
    el('circle', { cx: 0, cy: 0, r: 5.5, fill: '#cfd6e4' }, this.spoonVec);
    el('circle', { cx: 0, cy: 0, r: 5.5, fill: 'none', stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 1.2 }, this.spoonVec);
    this._spoonBowls = Array.prototype.slice.call(this.spoonVec.querySelectorAll('circle'));
    /* 写实吧匙：一张**竖图**（柄在上、碗在下），stir 分支每帧按「柄端 → 碗端」的连线定位并
       旋转（本地 +y 轴指向碗端）。宽高比要等图加载完才知道，先用抠图时量到的 0.168 兜着。 */
    this.spoonAsp = 0.168;
    this.spoonImg = el('image', {
      href: assetUrl('eq', 'spoon'), x: -13, y: 0, width: 26, height: 160, opacity: 0
    }, this.spoon);
    this.spoonImg.onload = () => {
      const nw = this.spoonImg.naturalWidth, nh = this.spoonImg.naturalHeight;
      if (nw && nh) this.spoonAsp = nw / nh;
      setAttr(this.spoonImg, 'opacity', 1);
      setAttr(this.spoonVec, 'opacity', 0);            /* 贴图到位就藏矢量吧匙 */
    };
    this.spoonImg.onerror = () => {
      if (this.spoonImg.parentNode && this.spoonImg.parentNode.removeChild) {
        this.spoonImg.parentNode.removeChild(this.spoonImg);
      }
      this.spoonImg = null;
    };

    /* 搅拌旋涡纹 + 倒酒残滴 */
    this.swirlMark = el('path', {
      d: 'M -9 0 A 9 9 0 1 1 9 0 A 6 6 0 1 0 -3 0 A 2.5 2.5 0 1 1 3 0',
      fill: 'none', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0
    }, svg);
    this.drip = el('circle', { r: 2.6, opacity: 0 }, svg);

    /* 捣棒 + 杯中捣压物 */
    this.muddleItems = el('g', { opacity: 0 }, svg);
    if (this.c.muddle) {
      const mx = this.gx;
      [[-8, 494, -20], [6, 497, 14], [-1, 488, 40]].forEach(p => {
        el('ellipse', { cx: mx + p[0], cy: p[1], rx: 6.5, ry: 3.6, fill: '#4f9450', stroke: '#356e38', 'stroke-width': 1, transform: `rotate(${p[2]} ${mx + p[0]} ${p[1]})` }, this.muddleItems);
      });
      el('path', { d: `M ${mx + 12} 500 L ${mx + 30} 480 L ${mx + 36} 498 Z`, fill: '#b9d977', stroke: '#8fb552', 'stroke-width': 1.2 }, this.muddleItems);
    }
    this.muddler = el('g', { opacity: 0 }, svg);
    /* 捣棒：圆头手柄 + 收窄的杵身（矢量件留着当回退）。杵头在 group 原点 ——
       muddle 分支把原点摆在压点上，所以贴图也按「底边中点在原点」摆 */
    const mvec = el('g', {}, this.muddler);
    el('path', {
      d: 'M -8 -122 Q -8 -134 0 -134 Q 8 -134 8 -122 L 6.5 -34 Q 6 0 0 0 Q -6 0 -6.5 -34 Z',
      fill: '#a5713d', stroke: '#8a5c30', 'stroke-width': 1.5
    }, mvec);
    el('rect', { x: -7.5, y: -100, width: 15, height: 4, rx: 2, fill: '#8a5c30' }, mvec);
    el('rect', { x: -6.8, y: -64, width: 13.6, height: 4, rx: 2, fill: '#8a5c30' }, mvec);
    useSprite(this.muddler, assetUrl('eq', 'muddler'), [-22, -140, 44, 140], mvec);

    /* 顶部注入瓶（苏打/起泡酒/可乐），按步骤懒加载缓存 */
    /* 暗角：整体压一层径向渐隐，把注意力收在台面上（同样不用滤镜） */
    el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#st-vig)', 'pointer-events': 'none' }, svg);

    this._topGroups = [];

    /* 液流（酒液多边形）与水花 */
    this.stream = el('polygon', { points: '0,0 0,0 0,0 0,0', opacity: 0 }, svg);
    this.splash = el('circle', { r: 0, fill: 'none', stroke: 'rgba(255,255,255,0.7)', 'stroke-width': 1.6, opacity: 0 }, svg);

    /* 用量浮动标签 */
    this.amountLabel = el('text', { x: jx, y: 430, 'text-anchor': 'middle', class: 'amount-label', opacity: 0 }, svg);

    /* 完成文字与星光（星光元素缓存） */
    this.sparkles = el('g', { class: 'sparkles' }, svg);
    this._sparkEls = [];
    const gy = glassDef.topY;
    [[-72, gy + 24], [66, gy - 8], [-44, gy - 52], [54, gy + 62], [12, gy - 86]].forEach(p => {
      const s = el('g', { transform: `translate(${this.gx + p[0]},${p[1]}) scale(0)`, opacity: 0 }, this.sparkles);
      el('path', { d: 'M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z', fill: '#f0c584' }, s);
      s._base = { x: this.gx + p[0], y: p[1] };
      this._sparkEls.push(s);
    });
    this.finishText = el('text', { x: this.gx, y: gy - 108, 'text-anchor': 'middle', class: 'finish-text', opacity: 0 }, svg);
    this.finishText.textContent = '完成 · 一杯' + this.c.name;
  };

  Stage.prototype._buildGlass = function (svg, defs) {
    const x = this.gx, c = this.c, type = c.glass;
    const lift = el('g', {}, svg);
    this.glassLift = lift;
    const defsMap = {
      rocks: {
        topY: 404, botY: 508, liqH: 100, surfW: 60,
        inner: `M ${x - 40} 406 L ${x + 40} 406 L ${x + 33} 510 L ${x - 33} 510 Z`,
        outline: `M ${x - 42} 402 L ${x + 42} 402 L ${x + 35} 512 L ${x - 35} 512 Z`,
        ice: [[x - 12, 472, -8], [x + 14, 486, 10], [x, 448, 18]], garnish: [x + 42, 400]
      },
      highball: {
        topY: 314, botY: 508, liqH: 190, surfW: 44,
        inner: `M ${x - 26} 316 L ${x + 26} 316 L ${x + 22} 510 L ${x - 22} 510 Z`,
        outline: `M ${x - 28} 312 L ${x + 28} 312 L ${x + 24} 512 L ${x - 24} 512 Z`,
        ice: [[x - 7, 458, -6], [x + 9, 486, 8], [x - 1, 430, 14], [x + 8, 452, -10]], garnish: [x + 26, 310]
      },
      coupe: {
        topY: 402, botY: 450, liqH: 44, surfW: 84,
        inner: `M ${x - 46} 404 C ${x - 46} 442 ${x - 24} 452 ${x} 452 C ${x + 24} 452 ${x + 46} 442 ${x + 46} 404 Z`,
        outline: `M ${x - 48} 400 C ${x - 48} 446 ${x - 26} 456 ${x} 456 C ${x + 26} 456 ${x + 48} 446 ${x + 48} 400`,
        stem: `M ${x} 456 L ${x} 504`, ice: [[x - 10, 434, -8], [x + 12, 438, 10]], garnish: [x + 48, 398]
      },
      martini: {
        topY: 398, botY: 458, liqH: 56, surfW: 80,
        inner: `M ${x - 44} 400 L ${x} 460 L ${x + 44} 400 Z`,
        outline: `M ${x - 46} 396 L ${x} 464 L ${x + 46} 396`,
        stem: `M ${x} 464 L ${x} 504`, ice: [[x - 8, 424, -6], [x + 6, 438, 8]], garnish: [x + 46, 394]
      },
      wine: {
        topY: 336, botY: 428, liqH: 88, surfW: 70,
        inner: `M ${x - 38} 338 C ${x - 38} 400 ${x - 16} 424 ${x} 430 C ${x + 16} 424 ${x + 38} 400 ${x + 38} 338 Z`,
        outline: `M ${x - 40} 334 C ${x - 40} 402 ${x - 18} 428 ${x} 434 C ${x + 18} 428 ${x + 40} 402 ${x + 40} 334`,
        stem: `M ${x} 434 L ${x} 502`, ice: [[x - 10, 392, -8], [x + 10, 404, 10], [x, 418, -14]], garnish: [x + 40, 330]
      }
    };
    const d = defsMap[type];
    const clipId = 'st-clip-glass';
    const cp = el('clipPath', { id: clipId }, defs);
    el('path', { d: d.inner }, cp);
    el('path', { d: d.outline, fill: 'rgba(255,255,255,0.045)', stroke: 'rgba(232,240,250,0.5)', 'stroke-width': 2, 'stroke-linecap': 'round' }, lift);
    if (d.stem) {
      el('path', { d: d.stem, stroke: 'rgba(232,240,250,0.5)', 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none' }, lift);
      el('ellipse', { cx: x, cy: type === 'wine' ? 504 : 506, rx: 27, ry: 4.6, fill: 'none', stroke: 'rgba(232,240,250,0.5)', 'stroke-width': 2 }, lift);
    }
    if (c.rim) {
      el('line', {
        x1: x - 44, y1: d.topY - 2, x2: x + 44, y2: d.topY - 2,
        stroke: c.rim === 'salt' ? '#ece5d5' : '#f5eddd', 'stroke-width': 5,
        'stroke-dasharray': '3 3', 'stroke-linecap': 'round', opacity: 0.9
      }, lift);
    }
    /* 折射带：玻璃壁透出来的背景亮边（画在酒液之下，才有"透过玻璃看见"的感觉） */
    el('rect', { x: x - 34, y: d.topY - 6, width: 26, height: d.botY - d.topY + 10, 'clip-path': `url(#${clipId})`, fill: 'url(#st-refr)' }, lift);
    this.glassLiquid = el('rect', { x: x - 48, y: d.botY, width: 96, height: 0, 'clip-path': `url(#${clipId})`, opacity: 0.92 }, lift);
    this.glassShine = el('rect', { x: x - 48, y: d.botY, width: 96, height: 0, 'clip-path': `url(#${clipId})`, fill: 'url(#st-liq)' }, lift);
    this.glassVeil = el('rect', { x: x - 48, y: d.botY, width: 96, height: 0, 'clip-path': `url(#${clipId})`, fill: '#ffffff', opacity: 0 }, lift);
    this.glassSurface = el('ellipse', {
      cx: x, cy: d.botY, rx: 30, ry: 5, fill: '#ffffff', opacity: 0,
      stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 0.9
    }, lift);
    /* 玻璃高光条：竖直一道，模拟顶光在杯壁上的反射（画在酒液之上、冰块之下） */
    el('rect', { x: x - 30, y: d.topY - 4, width: 15, height: d.botY - d.topY + 8, 'clip-path': `url(#${clipId})`, fill: 'url(#st-hl)' }, lift);
    /* 杯内冰块（直调；以及摇和后加冰饮用的古典杯，如威士忌酸） */
    this.glassCubes = [];
    if (this.build || (c.method === 'shake' && c.glass === 'rocks')) {
      for (const s of d.ice) {
        const cube = makeCube(lift);
        setAttr(cube, 'transform', `translate(${s[0]},${s[1]}) rotate(${s[2]})`);
        setAttr(cube, 'opacity', 0);
        this.glassCubes.push({ node: cube, slot: s });
      }
    }
    this.bubbleG = el('g', { class: 'bubble-g', 'clip-path': `url(#${clipId})`, opacity: 0 }, lift);
    for (let i = 0; i < 9; i++) {
      const b = el('circle', {
        cx: x - 30 + (i * 37) % 58, cy: 470 + (i * 23) % 36, r: 1.4 + (i % 3) * 0.9,
        fill: 'rgba(255,255,255,0.8)', class: 'bub', style: `animation-delay:${(i * 0.45) % 2.2}s;animation-duration:${1.8 + (i % 4) * 0.5}s`
      }, this.bubbleG);
    }
    /* 装饰 */
    this.garnishG = el('g', { opacity: 0 }, lift);
    this.garnishNode = buildGarnish(c.garnish, this.garnishG);
    this.garnishAnchor = { x: d.garnish[0], y: d.garnish[1] };
    d.cap = { rocks: 160, highball: 260, coupe: 150, martini: 130, wine: 300 }[type];
    this.glassCap = d.cap;
    return d;
  };

  /* ---------- 每杯专属特色动画 ---------- */
  Stage.prototype._buildFX = function (svg, defs) {
    const fx = this.c.fx;
    if (!fx) { this.fx = null; return; }
    const t = fx.type, g = this.gx, gy = this.glassDef.topY;
    const F = this.fx = { type: t };
    const clip = 'url(#st-clip-glass)';

    if (t === 'salt') {
      /* 玛格丽特：盐粒撒落杯口 */
      F.dots = [];
      for (let k = 0; k < 14; k++) {
        const d = el('circle', { r: 1.4 + (k % 3) * 0.5, fill: '#ece5d5', opacity: 0 }, svg);
        d._d = { x: g - 42 + ((k * 37) % 84), delay: (k % 7) * 0.07, drift: ((k * 29) % 12) - 6 };
        F.dots.push(d);
      }
    } else if (t === 'mint') {
      /* 莫吉托：气泡串上升（薄荷叶摆动在渲染中处理） */
      F.bub = [];
      for (let k = 0; k < 9; k++) {
        const b = el('circle', { r: 1.6 + (k % 3) * 0.9, fill: 'rgba(255,255,255,0.9)', opacity: 0 }, svg);
        b._d = { x: g - 22 + ((k * 23) % 44), off: (k * 0.37) % 1 };
        F.bub.push(b);
      }
    } else if (t === 'mist' || t === 'twist') {
      /* 尼格罗尼/马天尼：皮油喷雾 */
      const col = t === 'mist' ? '#f0923c' : '#e8dd6e';
      const edge = t === 'mist' ? '#c96f1f' : '#b8a83a';
      F.peel = el('g', { opacity: 0 }, svg);
      el('path', { d: 'M -13 7 C -7 -9 6 -13 14 -4 C 7 -9 -2 -3 -7 9 Z', fill: col, stroke: edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, F.peel);
      F.spray = [];
      for (let k = 0; k < 10; k++) {
        const d = el('circle', { r: 1.7, fill: col, opacity: 0 }, svg);
        d._a = k / 10 * Math.PI * 2;
        F.spray.push(d);
      }
    } else if (t === 'sweep') {
      /* 古典：光泽扫过杯身 + 橙皮擦杯口 */
      const grad = el('linearGradient', { id: 'st-shine', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
      el('stop', { offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, grad);
      el('stop', { offset: '50%', 'stop-color': '#ffffff', 'stop-opacity': 0.4 }, grad);
      el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, grad);
      F.shine = el('rect', { x: g - 92 - 26, y: gy - 60, width: 52, height: 210, fill: 'url(#st-shine)', opacity: 0, transform: `rotate(14 ${g} ${gy})` }, svg);
      F.peel = el('g', { opacity: 0 }, svg);
      el('path', { d: 'M -13 7 C -7 -9 6 -13 14 -4 C 7 -9 -2 -3 -7 9 Z', fill: '#f0923c', stroke: '#c96f1f', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, F.peel);
    } else if (t === 'ripple') {
      /* 曼哈顿：樱桃入杯涟漪 */
      F.ripples = [];
      for (let k = 0; k < 3; k++) {
        const r = el('ellipse', { cx: g, cy: 0, rx: 6, ry: 2, fill: 'none', stroke: '#f0c584', 'stroke-width': 2, opacity: 0 }, svg);
        r._d = k * 0.22;
        F.ripples.push(r);
      }
    } else if (t === 'frost') {
      /* 代基里：杯身结霜 */
      F.g = el('g', { 'clip-path': clip, opacity: 0 }, this.glassLift);
      el('rect', { x: g - 50, y: gy, width: 100, height: 210, fill: 'rgba(235,245,255,0.12)' }, F.g);
      F.dots = [];
      const dTop = this.glassDef.topY, dBot = this.glassDef.botY;
      for (let k = 0; k < 30; k++) {
        const d = el('circle', {
          cx: g - 40 + ((k * 53) % 80), cy: dTop + 10 + ((k * 31) % Math.max(20, dBot - dTop - 16)),
          r: 0.9 + (k % 4) * 0.4, fill: 'rgba(255,255,255,0.92)', opacity: 0
        }, F.g);
        d._th = 0.1 + k * 0.024;
        F.dots.push(d);
      }
      F.wisp = [];
      for (const dx of [-34, 30]) {
        F.wisp.push(el('path', {
          d: `M ${g + dx} ${gy - 22} q 12 -16 0 -32`, fill: 'none',
          stroke: 'rgba(215,235,255,0.55)', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0
        }, svg));
      }
    } else if (t === 'foam' || t === 'crema') {
      /* 威士忌酸泡沫 / 浓缩马天尼咖啡油脂 */
      F.g = el('g', { 'clip-path': clip, opacity: 0 }, this.glassLift);
      F.band = el('rect', {
        x: g - 48, y: gy, width: 96, height: 0, rx: 5,
        fill: t === 'foam' ? '#efe6cf' : '#c8a97e', opacity: 0.92
      }, F.g);
      F.flecks = [];
      for (let k = 0; k < 6; k++) {
        F.flecks.push(el('circle', {
          cx: g - 38 + k * 15, cy: 0, r: 1.6 + (k % 2),
          fill: t === 'foam' ? '#d8c9a8' : '#8a5c30', opacity: 0
        }, F.g));
      }
    } else if (t === 'burst') {
      /* 阿佩罗：橙色气泡欢腾 + 光晕 */
      F.dots = [];
      for (let k = 0; k < 14; k++) {
        const b = el('circle', { r: 1.5 + (k % 4) * 0.8, fill: k % 3 ? '#f8b06a' : 'rgba(255,255,255,0.9)', opacity: 0 }, svg);
        b._d = { x: g - 30 + ((k * 41) % 60), off: (k * 0.29) % 1 };
        F.dots.push(b);
      }
      F.glow = el('ellipse', { rx: 96, ry: 62, fill: 'none', stroke: '#f08c2e', 'stroke-width': 2, opacity: 0, transform: `translate(${g},${gy + 70})` }, svg);
    } else if (t === 'settle') {
      /* 长岛冰茶：可乐沉降 */
      F.g = el('g', { 'clip-path': clip, opacity: 1 }, this.glassLift);
      F.layer = el('rect', { x: g - 48, y: gy, width: 96, height: 0, fill: '#3a1e0e', opacity: 0 }, F.g);
    } else if (t === 'swirl') {
      /* 大都会：酒液回旋 */
      F.g = el('g', { 'clip-path': clip, opacity: 0 }, this.glassLift);
      F.arcs = [];
      for (let k = 0; k < 2; k++) {
        F.arcs.push(el('ellipse', {
          cx: g, cy: 0, rx: 34 - k * 10, ry: 11 - k * 3,
          fill: 'none', stroke: '#f0909c', 'stroke-width': 7 - k * 2, opacity: 0.55, 'stroke-linecap': 'round'
        }, F.g));
      }
    }
  };

  Stage.prototype._resetFX = function () {
    const F = this.fx;
    if (!F) return;
    const hide = n => { if (n) setAttr(n, 'opacity', 0); };
    if (F.dots) F.dots.forEach(hide);
    if (F.bub) F.bub.forEach(hide);
    if (F.spray) F.spray.forEach(hide);
    if (F.flecks) F.flecks.forEach(hide);
    if (F.ripples) F.ripples.forEach(hide);
    if (F.wisp) F.wisp.forEach(hide);
    if (F.arcs) F.arcs.forEach(hide);
    hide(F.peel); hide(F.shine); hide(F.g); hide(F.glow);
  };

  Stage.prototype._renderFX = function (p, st) {
    const F = this.fx;
    if (!F) return;
    const t = F.type, g = this.gx, gy = this.glassDef.topY;
    const surfY = this.glassDef.botY - st.gLevel * this.glassDef.liqH;
    const env = Math.sin(Math.PI * clamp(p, 0, 1));

    switch (t) {
      case 'salt': {
        /* 盐粒分批落下，落定后停在杯口 */
        const rimY = gy - 4;
        F.dots.forEach(d => {
          const dp = phase(p, d._d.delay, d._d.delay + 0.5);
          if (dp <= 0) return;
          const e = easeOutCubic(dp);
          setAttr(d, 'cx', (d._d.x + Math.sin(dp * Math.PI) * d._d.drift).toFixed(1));
          setAttr(d, 'cy', lerp(rimY - 78, rimY, e).toFixed(1));
          setAttr(d, 'opacity', 1);
        });
        break;
      }
      case 'mint': {
        /* 薄荷叶摆动 + 气泡串上升 */
        const sway = Math.sin(p * Math.PI * 5) * 13 * (1 - phase(p, 0.78, 1));
        const a = this.garnishAnchor;
        setAttr(this.garnishG, 'transform', `translate(${a.x},${a.y}) rotate(${sway.toFixed(1)}) scale(1.15)`);
        const yTop = Math.max(gy + 26, surfY + 14);
        F.bub.forEach(b => {
          const lp = (p * 1.8 + b._d.off) % 1;
          setAttr(b, 'cy', lerp(504, yTop, lp).toFixed(1));
          setAttr(b, 'cx', (b._d.x + Math.sin(lp * 10 + b._d.off * 25) * 3.5).toFixed(1));
          setAttr(b, 'opacity', (Math.sin(lp * Math.PI) * 0.9).toFixed(2));
        });
        break;
      }
      case 'mist':
      case 'twist': {
        /* 皮油喷雾：果皮拧转，油滴呈伞状散落向液面 */
        const px = g + 24, py = gy - 66;
        const e = Math.min(phase(p, 0, 0.1), 1 - phase(p, 0.88, 1));
        setAttr(F.peel, 'opacity', e.toFixed(2));
        setAttr(F.peel, 'transform', `translate(${px},${py}) rotate(${(Math.sin(p * Math.PI * 3) * 26).toFixed(1)}) scale(1.35)`);
        const rp = phase(p, 0.22, 0.82);
        F.spray.forEach(d => {
          const R = rp * 58;
          const ang = d._a + p * 0.9;
          setAttr(d, 'cx', (px - 8 + Math.cos(ang) * R).toFixed(1));
          setAttr(d, 'cy', (py + Math.abs(Math.sin(ang)) * R * 0.9).toFixed(1));
          setAttr(d, 'opacity', (Math.sin(clamp(rp, 0, 1) * Math.PI) * 0.9).toFixed(2));
        });
        break;
      }
      case 'sweep': {
        /* 光泽斜扫过杯身 + 橙皮沿杯口擦拭 */
        const sx = lerp(g - 92, g + 92, p);
        setAttr(F.shine, 'x', (sx - 26).toFixed(1));
        setAttr(F.shine, 'opacity', (env * 0.95).toFixed(2));
        const wx = lerp(g - 36, g + 36, p);
        setAttr(F.peel, 'opacity', (env * 0.95).toFixed(2));
        setAttr(F.peel, 'transform', `translate(${wx.toFixed(1)},${(gy - 14).toFixed(1)}) rotate(${(Math.sin(p * Math.PI * 4) * 18).toFixed(1)}) scale(0.9)`);
        break;
      }
      case 'ripple': {
        /* 樱桃轻点 + 涟漪荡开 */
        const a = this.garnishAnchor;
        const dip = -5 * Math.sin(Math.PI * phase(p, 0, 0.32));
        setAttr(this.garnishG, 'transform', `translate(${a.x},${(a.y + dip).toFixed(1)}) rotate(0) scale(1.15)`);
        F.ripples.forEach(r => {
          const rp = phase(p, r._d, r._d + 0.6);
          setAttr(r, 'cy', surfY.toFixed(1));
          setAttr(r, 'rx', (6 + rp * 32).toFixed(1));
          setAttr(r, 'ry', (2 + rp * 8).toFixed(1));
          setAttr(r, 'opacity', ((1 - rp) * 0.85).toFixed(2));
        });
        break;
      }
      case 'frost': {
        /* 白霜沿杯壁逐步凝结（保留） + 冷气飘散 */
        setAttr(F.g, 'opacity', 1);
        F.dots.forEach(d => setAttr(d, 'opacity', p > d._th ? 0.92 : 0));
        F.wisp.forEach(w => {
          const wp = phase(p, 0.15, 0.75);
          setAttr(w, 'opacity', (Math.sin(wp * Math.PI) * 0.7).toFixed(2));
        });
        break;
      }
      case 'foam':
      case 'crema': {
        /* 泡沫层 / 咖啡油脂层浮现（保留） */
        const h = (t === 'foam' ? 17 : 13) * phase(p, 0.08, 0.62);
        setAttr(F.g, 'opacity', 1);
        setAttr(F.band, 'y', (surfY - h).toFixed(1));
        setAttr(F.band, 'height', Math.max(0, h).toFixed(1));
        F.flecks.forEach((d, k) => {
          setAttr(d, 'cy', (surfY - 3 - ((k * 5) % Math.max(1, h - 5))).toFixed(1));
          setAttr(d, 'opacity', h > 5 ? 0.85 : 0);
        });
        break;
      }
      case 'burst': {
        /* 气泡欢腾 + 橙色光晕脉冲 */
        const yTop = Math.max(gy + 30, surfY + 20);
        const y0 = Math.min(502, this.glassDef.botY - 8);
        F.dots.forEach(b => {
          const lp = (p * 2.4 + b._d.off) % 1;
          setAttr(b, 'cy', lerp(y0, yTop, lp).toFixed(1));
          setAttr(b, 'cx', (b._d.x + Math.sin(lp * 13 + b._d.off * 30) * 4).toFixed(1));
          setAttr(b, 'opacity', (Math.sin(lp * Math.PI) * 0.95).toFixed(2));
        });
        setAttr(F.glow, 'opacity', (env * 0.5).toFixed(2));
        setAttr(F.glow, 'transform', `translate(${g},${gy + 70}) scale(${(0.82 + env * 0.22).toFixed(2)})`);
        break;
      }
      case 'settle': {
        /* 可乐自上而下沉降，随后与酒液融合 */
        const liqH = st.gLevel * this.glassDef.liqH;
        const grow = phase(p, 0.05, 0.62);
        const fade = 1 - phase(p, 0.58, 1);
        setAttr(F.layer, 'y', surfY.toFixed(1));
        setAttr(F.layer, 'height', (liqH * grow * 0.96).toFixed(1));
        setAttr(F.layer, 'opacity', (0.6 * fade).toFixed(2));
        break;
      }
      case 'swirl': {
        /* 胭脂色酒液回旋 */
        const cy = (surfY + this.glassDef.botY) / 2;
        setAttr(F.g, 'opacity', (env * 0.9).toFixed(2));
        setAttr(F.g, 'transform', `rotate(${(p * 540).toFixed(1)} ${g} ${cy.toFixed(1)})`);
        F.arcs.forEach(a => setAttr(a, 'cy', cy.toFixed(1)));
        break;
      }
    }
  };

  Stage.prototype._buildSteps = function () {
    const c = this.c, steps = [];
    const push = (type, label, short, dur, data) => steps.push(Object.assign({ type: type, label: label, short: short, dur: dur }, data || {}));

    if (c.muddle) push('muddle', '捣压薄荷与青柠', '捣压', STEP_DUR.muddle);
    if (c.iceFirst) push('ice', '加入冰块', '加冰', STEP_DUR.ice);
    c.ingredients.forEach(ing => {
      const amt = ing.dash ? ing.dash + ' 滴' : ing.ml + ' ml';
      push('pour', `量取 ${ing.name} ${amt}`, ing.name, 1.5 + ing.ml * 0.018, { ing: ing, idx: this._ingIndex(ing) });
    });
    if (!c.iceFirst) push('ice', '加入冰块', '加冰', STEP_DUR.ice);
    if (c.method === 'shake') push('shake', '用力摇和 12–15 秒', '摇和', STEP_DUR.shake);
    if (c.method === 'stir') push('stir', '吧匙贴壁缓慢搅拌', '搅拌', STEP_DUR.stir);
    if (c.stirInGlass) push('stirGlass', '吧匙提拉搅拌融合', '搅拌', STEP_DUR.stirGlass);
    (c.tops || []).forEach(top => push('top', `缓缓注入${top.name}`, top.name, STEP_DUR.top, { top: top }));
    if (c.method === 'shake' || c.method === 'stir') push('strain', '滤冰入杯', '滤酒', STEP_DUR.strain);
    push('garnish', `装饰：${c.garnishName}`, '装饰', STEP_DUR.garnish);
    if (c.fx) push('signature', c.fx.label, '特色', 2.8);
    push('finish', '完成，请享用', '完成', STEP_DUR.finish);

    let t = 0, mixEnd = 0;
    steps.forEach((s, i) => {
      this.times[i] = t; t += s.dur;
      if (s.type === 'top') this.topEnd = t;
      /* 混合完成时刻：摇和/搅拌/杯中搅拌/最后的注入，之后酒液呈现这杯酒的真实颜色 */
      if (s.type === 'shake' || s.type === 'stir' || s.type === 'stirGlass' || s.type === 'top') mixEnd = t;
    });
    this.steps = steps;
    this.total = t;
    this.mixEnd = mixEnd;
    /* 基酒总用量只依赖配方，构建时算一次即可（原先在 stateAt 每帧重算） */
    this.totalIng = c.ingredients.reduce((sum, i) => sum + i.ml, 0);
    /* 本杯载杯的杯壁收放系数：液位换算要用（见 levelFromVolume） */
    this.glassTaper = GLASS_TAPER[c.glass] === undefined ? 0.3 : GLASS_TAPER[c.glass];
  };

  Stage.prototype._ingIndex = function (ing) {
    return this.c.ingredients.indexOf(ing);
  };

  Stage.prototype.stepAt = function (t) {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (t >= this.times[i]) return i;
    }
    return 0;
  };

  /* ---------- 状态（纯函数） ---------- */
  Stage.prototype.stateAt = function (t) {
    const c = this.c, mode = this.mode;
    const totalIng = this.totalIng;
    let vParts = [], gParts = [], vML = 0, gML = 0;
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i], st = this.times[i], en = st + s.dur;
      if (t < st) break;
      const p = t >= en ? 1 : clamp((t - st) / s.dur, 0, 1);
      if (s.type === 'pour') {
        /* 瓶→量酒器→容器：容器液位在量酒器翻杯阶段上升 */
        const pf = phase(p, 0.60, 0.82);
        const part = { color: s.ing.color, ml: s.ing.ml * pf };
        if (mode === 'build') { gParts.push(part); gML += s.ing.ml * pf; }
        else { vParts.push(part); vML += s.ing.ml * pf; }
      } else if (s.type === 'top') {
        const pf = phase(p, 0.15, 0.7);
        gParts.push({ color: s.top.color, ml: s.top.ml * pf });
        gML += s.top.ml * pf;
      } else if (s.type === 'strain') {
        const pf = phase(p, 0.42, 0.76);
        gParts = c.ingredients.map(i => ({ color: i.color, ml: i.ml }));
        gML = totalIng * pf;
        vParts = c.ingredients.map(i => ({ color: i.color, ml: i.ml * (1 - pf) }));
        vML = totalIng * (1 - pf);
      }
    }
    /* 混合完成后，颜色向这杯酒的真实参考色过渡（摇和/搅拌让酒体均匀） */
    let vColor = mixColors(vParts), gColor = gParts.length ? mixColors(gParts) : c.color;
    const blend = phase(t, this.mixEnd, this.mixEnd + 0.7);
    if (blend > 0) {
      vColor = mixTwo(vColor, c.color, blend);
      gColor = mixTwo(gColor, c.color, blend);
    }
    return {
      vParts: vParts, gParts: gParts,
      /* 液位由「体积 + 杯型截面」解出来：同样多的酒，直筒杯涨得快、V 形杯涨得慢 */
      vLevel: this.build ? 0 : levelFromVolume(vML, 210, 0.92, 0.05),
      gLevel: levelFromVolume(gML, this.glassCap, 0.88, this.glassTaper),
      vColor: vColor,
      gColor: gColor,
      cloudy: c.method === 'shake' && t >= this.mixEnd - 0.01,
      bubbles: !!c.bubbles && this.topEnd >= 0 && t >= this.topEnd - 0.01
    };
  };

  /* ---------- 每帧渲染 ---------- */
  /* 高光层与浑浊层跟随酒液几何 */
  Stage.prototype._syncLiquidFx = function (rect, shine, veil, veilOn) {
    const y = rect.getAttribute('y'), h = rect.getAttribute('height');
    if (shine) { setAttr(shine, 'y', y); setAttr(shine, 'height', h); }
    if (veil) {
      setAttr(veil, 'y', y); setAttr(veil, 'height', h);
      setAttr(veil, 'opacity', veilOn ? 0.15 : 0);
    }
  };

  Stage.prototype._setLiquid = function (rect, surface, level, color, botY, liqH, surfW) {
    const h = level * liqH;
    setAttr(rect, 'y', botY - h - 1);
    setAttr(rect, 'height', h + 1.5);
    setAttr(rect, 'fill', color);
    setAttr(surface, 'cy', botY - h);
    setAttr(surface, 'rx', surfW * (0.5 + level * 0.45));
    setAttr(surface, 'fill', lighten(color, 0.35));
    setAttr(surface, 'opacity', level > 0.03 ? 0.5 : 0);
  };

  /* 物理液流：出口沿瓶口方向射出，受重力弯折加速下落（三次贝塞尔近似抛物线），
     液柱随下落速度增加而变细（连续性方程），末端垂直入杯 */
  /* 物理液流：只由「出口位置 + 出口速度 + g」决定轨迹 —— 出口速度是对手的位移求导得来的，
     所以倒得快液流就甩得更远、落点更偏，倒得慢则近乎垂直；液柱宽度由连续性方程随速度收细；
     落点由解方程算出（不是写死的贝塞尔控制点），溅起点与飞溅半径也随入射速度变化。
     返回落点信息，供液面晃动（冲量）使用。 */
  Stage.prototype._setStream = function (poly, splash, p0, v0, yTarget, color, op, w0) {
    if (op <= 0) { setAttr(poly, 'opacity', 0); if (splash) setAttr(splash, 'opacity', 0); return null; }
    const v0speed = Math.hypot(v0.x, v0.y);
    const tf = fallTime(p0.y, v0.y, yTarget);
    const T = clamp(tf === null ? 0.3 : tf, 0.04, 1.5);
    const N = 8, left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const tau = T * i / N;
      const q = projAt(p0, v0, tau);
      const vx = v0.x, vy = v0.y + GRAV * tau;
      const sp = Math.hypot(vx, vy) || 1;
      const px = -vy / sp, py = vx / sp;                 /* 轨迹法线 */
      const hw = streamWidth(w0, sp, v0speed) / 2;
      left.push([q.x + px * hw, q.y + py * hw]);
      right.push([q.x - px * hw, q.y - py * hw]);
    }
    setAttr(poly, 'points', left.map(p2 => p2[0].toFixed(1) + ',' + p2[1].toFixed(1))
      .concat(right.reverse().map(p2 => p2[0].toFixed(1) + ',' + p2[1].toFixed(1))).join(' '));
    setAttr(poly, 'fill', color);
    setAttr(poly, 'opacity', 0.82 * op);
    const hit = projAt(p0, v0, T);
    const hitSpeed = Math.hypot(v0.x, v0.y + GRAV * T);
    if (splash) {
      setAttr(splash, 'cx', hit.x); setAttr(splash, 'cy', hit.y + 2);
      setAttr(splash, 'r', 2 + op * clamp(hitSpeed / 900, 1.5, 9));
      setAttr(splash, 'opacity', 0.6 * op);
    }
    return { x: hit.x, y: hit.y, speed: hitSpeed };
  };

  /* 液面晃动查表：找最近一次「液流砸进容器」的冲量，按阻尼振子的解析冲量响应算此刻的倾角。
     冲量 = 砸进去的毫升数 × 入射速度（入射速度由落高按托里拆利给），液层越浅晃得越快。 */
  Stage.prototype._sloshAt = function (t) {
    let best = null;
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.type === 'muddle') {
        /* 捣压：手每半周期把杵头砸到杯底一次（频率 MUDDLE_F，幅度按阻尼衰减）——
           直接按频率算冲击时刻，不去读烘焙（烘焙是懒加载的，读到没有会随擦洗路径变化）。 */
        const mt1 = this.times[i] + s.dur * 0.12, mt2 = this.times[i] + s.dur * 0.86;
        if (t <= mt1) break;
        const period = 1 / (2 * MUDDLE_F);
        const hitT = mt1 + Math.floor((Math.min(t, mt2) - mt1) / period) * period;
        const depth = this.glassDef.liqH * 0.5 + 18;
        const imp = sloshImpulse(depth, 18, 380 * Math.exp(-0.25 * (hitT - mt1)));
        if (!best || hitT > best.t0) best = { imp: imp, t0: hitT, target: 'glass' };
        continue;
      }
      if (s.type !== 'pour' && s.type !== 'top') continue;
      const isPour = s.type === 'pour';
      const impact = this.times[i] + s.dur * (isPour ? 0.71 : 0.45);
      if (t < impact) break;
      const ml = isPour ? s.ing.ml : s.top.ml;
      /* 落高：倒酒是「量酒器壶口 → 容器液面」≈ 200 px；顶部注入是「瓶口 → 杯口」≈ 90 px */
      const v = Math.sqrt(2 * GRAV * (isPour ? 200 : 90));
      const target = (s.type === 'top' || this.c.method === 'build') ? 'glass' : 'vessel';
      const depth = (target === 'vessel' && this.vessel ? this.vessel.liqH : this.glassDef.liqH) * 0.5 + 18;
      best = { imp: sloshImpulse(depth, ml, v), t0: impact, target: target };
    }
    if (!best) return null;
    return { angle: sloshAngle(best.imp.om, best.imp.j, t - best.t0), target: best.target };
  };

  /* 落冰烘焙：每块冰是一个一维刚体 —— 重力下落，砸到底按恢复系数反弹，切向摩擦吃掉水平速度，
     并把冲击的线速度转成自转，动能不够就停下休眠。三块冰依次投入（不是一起掉）。 */
  Stage.prototype._bakeIce = function (dur, cubes) {
    const n = Math.ceil(dur / PHYS_DT) + 1;
    const R = fixedRand(cubes.length * 7 + 3);
    const tracks = cubes.map((cube, k) => {
      const x = new Float32Array(n), y = new Float32Array(n), rot = new Float32Array(n), op = new Float32Array(n);
      const rel = 0.06 + k * 0.14;                       /* 出手时刻（步骤内的进度） */
      const floorY = cube.slot[1];                       /* 每块冰落在自己的槽位高度上 */
      let px = cube.slot[0], py = cube.slot[1] - 150, vy = 0;
      let vx = (R() - 0.5) * 40, r = cube.slot[2], w = (R() - 0.5) * 260;
      for (let i = 0; i < n; i++) {
        const t = i * PHYS_DT, p = t / dur;
        if (p >= rel) {
          vy += GRAV * PHYS_DT; py += vy * PHYS_DT;
          px += vx * PHYS_DT; r += w * PHYS_DT;
          w *= (1 - 1.2 * PHYS_DT);                      /* 空气阻尼 */
          if (py >= floorY) {
            py = floorY;
            if (vy > 70) { w += (vx >= 0 ? 1 : -1) * vy * 0.018; vy = -vy * 0.28; vx *= 0.55; }
            else { vy = 0; vx *= 0.8; }                  /* 动能不够就不再弹，靠摩擦停下 */
          }
        }
        x[i] = px; y[i] = py; rot[i] = r;
        op[i] = p < rel ? 0 : clamp((p - rel) * dur / 0.12, 0, 1);
      }
      return { x: x, y: y, rot: rot, op: op };
    });
    return { n: n, cubes: tracks };
  };

  /* 摇和烘焙：手是驱动源 —— 抬起 → 真实时间 4.5 Hz 的三连击（幅度按阻尼衰减）→ 松手。
     壶体跟着手走；壶内冰块在「壶的加速度」这个非惯性系里被甩动：伪加速度 = -a_容器，
     撞壶壁按恢复系数 + 摩擦交换动量并把线速度转成自转 —— 于是翻腾是碰撞驱动的，
     而不是 sin(p·33) 那种节拍器。松手后壶自由落体砸台面、弹两下停住（取代 easeOutBounce）。 */
  Stage.prototype._bakeShake = function (dur, cubes) {
    const n = Math.ceil(dur / PHYS_DT) + 1;
    const t1 = dur * 0.12, t2 = dur * 0.85;
    const F = 4.5, W = 2 * Math.PI * F, A = 46, GAM = 0.55;
    const drive = t => {                                 /* 手（壶）的位姿 */
      if (t <= t1) {
        return { x: 0, y: -175 * easeOutCubic(t / t1), rot: 0 };
      }
      const s = Math.exp(-GAM * (t - t1));
      return {
        x: A * s * (Math.sin(W * (t - t1)) + 0.25 * Math.sin(2 * W * (t - t1) + 1.1)),
        y: -175 + 0.35 * A * s * Math.sin(W * (t - t1) + 0.8),
        rot: 14 * s * Math.sin(W * (t - t1) + 0.4)
      };
    };
    const VS = { x: new Float32Array(n), y: new Float32Array(n), rot: new Float32Array(n), sp: new Float32Array(n) };
    const relPose = drive(t2), relPrev = drive(Math.max(0, t2 - 0.004));
    let bx = relPose.x, by = relPose.y, br = relPose.rot;
    let bvx = (relPose.x - relPrev.x) / 0.004, bvy = (relPose.y - relPrev.y) / 0.004;
    for (let i = 0; i < n; i++) {
      const t = i * PHYS_DT;
      if (t <= t2) {
        const d = drive(t);
        const dv = drive(Math.max(0, t - 0.004));
        bx = d.x; by = d.y; br = d.rot;
        bvx = (d.x - dv.x) / 0.004; bvy = (d.y - dv.y) / 0.004;
      } else {
        /* 松手后：水平不受力（匀速），竖直只受重力；砸到台面弹两下 */
        bvy += GRAV * PHYS_DT;
        by += bvy * PHYS_DT;
        bx += bvx * PHYS_DT;
        if (by >= 0) { by = 0; if (bvy > 120) bvy = -bvy * 0.32; else { bvy = 0; bvx *= 0.45; } }
        bvx *= (1 - 0.9 * PHYS_DT);
      }
      VS.x[i] = bx; VS.y[i] = by; VS.rot[i] = br;
      VS.sp[i] = Math.hypot(bvx, bvy);
    }
    /* 壶内冰块：非惯性系 + 撞壁 */
    const WT = this.vx - 28, WB = this.vx + 28, WTOP = 396, WBOT = 492;
    const R = fixedRand(11 + cubes.length * 5);
    const tracks = cubes.map((cube, k) => {
      const xa = new Float32Array(n), ya = new Float32Array(n), ra = new Float32Array(n);
      let x = cube.slot[0], y = cube.slot[1], vx = 0, vy = 0, r = cube.slot[2], w = (R() - 0.5) * 90;
      for (let i = 0; i < n; i++) {
        const ax = accelAt(VS.x, i, n);
        const ay = accelAt(VS.y, i, n);
        vx += -ax * PHYS_DT;                              /* 非惯性系：伪力 -a（水平） */
        vy += (GRAV - ay) * PHYS_DT;
        x += vx * PHYS_DT; y += vy * PHYS_DT;
        if (x < WT) { x = WT; if (vx < 0) { w += vy * 0.012; vx = -vx * 0.32; vy *= 0.86; } }
        if (x > WB) { x = WB; if (vx > 0) { w -= vy * 0.012; vx = -vx * 0.32; vy *= 0.86; } }
        if (y < WTOP) { y = WTOP; if (vy < 0) vy = -vy * 0.3; }
        if (y > WBOT) { y = WBOT; if (vy > 0) { w += vx * 0.014; vy = -vy * 0.32; vx *= 0.82; } }
        w *= (1 - 0.8 * PHYS_DT);
        r += w * PHYS_DT;
        xa[i] = x; ya[i] = y; ra[i] = r;
      }
      return { x: xa, y: ya, rot: ra };
    });
    return { n: n, vessel: VS, cubes: tracks };
  };

  /* 搅拌烘焙：吧匙由手驱动（真实时间 0.9 Hz 画圆，两头起手/收手），液体则是一阶粘性跟随
     ω_l' = k(ω_s − ω_l) —— 所以起转有过程、停手后还有余转；旋涡纹的转速与不透明度都跟着 ω_l 走，
     冰块的自转跟得更慢（惯性），并被离心力慢慢甩向外圈（同样带阻尼）。 */
  Stage.prototype._bakeStir = function (dur, cubes, spoonRate) {
    const n = Math.ceil(dur / PHYS_DT) + 1;
    const WS = 2 * Math.PI * spoonRate;
    const K = 2.2, DRAG = 0.6;
    const ang = new Float32Array(n), wl = new Float32Array(n);
    const ice = cubes.map(() => ({ rot: new Float32Array(n), dr: new Float32Array(n) }));
    const st = cubes.map(() => ({ th: 0, w: 0, r: 0 }));
    let a = 0, w = 0;
    for (let i = 0; i < n; i++) {
      const t = i * PHYS_DT, p = t / dur;
      const env = clamp(Math.min(p / 0.12, (1 - p) / 0.12), 0, 1);   /* 起手 / 收手 */
      w += (K * (WS * env - w)) * PHYS_DT;
      a += w * PHYS_DT;
      ang[i] = a; wl[i] = w;
      st.forEach((s2, k) => {
        s2.w += (K * 0.55 * (w - s2.w)) * PHYS_DT;                    /* 冰块转得更慢 */
        s2.r += (s2.w * s2.w * 0.0012 * (30 - s2.r) - DRAG * s2.r) * PHYS_DT;
        s2.th += s2.w * PHYS_DT;
        ice[k].rot[i] = s2.th;
        ice[k].dr[i] = s2.r;
      });
    }
    return { n: n, ang: ang, wl: wl, ws: WS, ice: ice };
  };

  /* 捣压烘焙：捣棒是有质量的 —— 手给下压驱动，捣棒以弹簧-阻尼跟随（于是有滞后与回弹），
     杵头撞到杯底时速度**反射**（恢复系数 0.25），冲击动量一部分转成薄荷/青柠的形变（阻尼弹簧），
     另一部分在 _sloshAt 里当作液面冲量（每一下都在砸液面）。 */
  const MUDDLE_FLOOR = 497, MUDDLE_F = 1.1;
  Stage.prototype._bakeMuddle = function (dur) {
    const n = Math.ceil(dur / PHYS_DT) + 1;
    const yA = new Float32Array(n), sq = new Float32Array(n);
    const t1 = dur * 0.12, t2 = dur * 0.86;
    /* 手的下压要**越过杯底**（+4），因为杵头会被杯底硬挡住：手给的是「压到底」的意图，
       接触力由约束产生 —— 这样才有触底冲击（形变 + 液面冲量）与回弹。 */
    const DOWN = MUDDLE_FLOOR + 4;
    const handY = t => {
      if (t <= t1) return lerp(250, DOWN, easeOutCubic(t / t1));
      if (t >= t2) return lerp(DOWN, 250, easeOutCubic((t - t2) / Math.max(1e-6, dur - t2)));
      return DOWN - Math.abs(Math.sin((t - t1) * Math.PI * MUDDLE_F) * 22 * Math.exp(-0.25 * (t - t1)));
    };
    let y = 250, v = 0, s = 0, sv = 0;
    for (let i = 0; i < n; i++) {
      const t = i * PHYS_DT, yh = handY(t);
      /* 弹簧-阻尼跟随手（这就是「捣棒有质量」） */
      v += ((yh - y) * 900 - v * 26) * PHYS_DT;
      y += v * PHYS_DT;
      if (y > MUDDLE_FLOOR) {
        y = MUDDLE_FLOOR;
        if (v > 0) { sv += v * 0.010; v = -v * 0.25; }      /* 触底：动量转形变 + 回弹 */
      }
      sv += (-s * 240 - sv * 14) * PHYS_DT;                  /* 形变：阻尼弹簧回复 */
      s += sv * PHYS_DT;
      yA[i] = y; sq[i] = clamp(s, 0, 1);
    }
    return { n: n, y: yA, sq: sq };
  };

  Stage.prototype._hide = function (n) { setAttr(n, 'opacity', 0); };

  Stage.prototype.render = function (t) {
    t = clamp(t, 0, this.total);
    const st = this.stateAt(t);
    const c = this.c;

    /* 液位（含高光与浑浊层的同步） */
    if (this.vessel) {
      this._setLiquid(this.vessel.liquid, this.vessel.surface, st.vLevel, st.vColor, this.vessel.botY, this.vessel.liqH, this.vessel.surfW);
      this._syncLiquidFx(this.vessel.liquid, this.vessel.shine, this.vessel.veil, st.cloudy);
    }
    this._setLiquid(this.glassLiquid, this.glassSurface, st.gLevel, st.gColor, this.glassDef.botY, this.glassDef.liqH, this.glassDef.surfW);
    this._syncLiquidFx(this.glassLiquid, this.glassShine, this.glassVeil, st.cloudy && st.gLevel > 0.02);
    setAttr(this.bubbleG, 'opacity', st.bubbles ? 0.9 : 0);

    /* 默认复位 */
    this._pouring = false;
    this._hide(this.stream); this._hide(this.splash); this._hide(this.drip); this._hide(this.swirlMark);
    setAttr(this.jigger.node, 'opacity', 0);
    setAttr(this.jigger.node, 'transform', '');
    setAttr(this.jigger.fill, 'height', 0);
    setAttr(this.jigger.label, 'opacity', 0);
    setAttr(this.amountLabel, 'opacity', 0);
    setAttr(this.spoon, 'opacity', 0);
    setAttr(this.muddler, 'opacity', 0);
    setAttr(this.muddleItems, 'opacity', 0);
    this._topGroups.forEach(g => setAttr(g, 'opacity', 0));
    if (this.vesselShadow) setAttr(this.vesselShadow, 'opacity', 1);
    this._resetFX();
    setAttr(this.glassLift, 'transform', 'translate(0,0)');
    setAttr(this.finishText, 'opacity', 0);
    this._sparkEls.forEach(s => { setAttr(s, 'transform', `translate(${s._base.x},${s._base.y}) scale(0)`); setAttr(s, 'opacity', 0); });
    this.bottles.forEach(b => setAttr(b.node, 'transform', `translate(${b.bx},${SHELF})`));
    if (this.vessel) setAttr(this.vessel.tilt, 'transform', '');
    if (this.streaks) this.streaks.forEach(s => setAttr(s, 'opacity', 0));

    let hint = '';

    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i], sStart = this.times[i], sEnd = sStart + s.dur;
      if (t < sStart) break;
      const p = t >= sEnd ? 1 : clamp((t - sStart) / s.dur, 0, 1);
      const isCur = t < sEnd;

      switch (s.type) {

        case 'pour': {
          /* 物理化倒酒：瓶子飞到容器上方悬停 → 倾斜 → 酒液抛物线落入量酒器
             → 量酒器翻杯倒入容器 → 瓶子放回架子 */
          const b = this.bottles[s.idx];
          const ing = s.ing;
          if (isCur) {
            const tgtX = this.build ? this.gx : this.vx;
            const mouthY0 = (this.build ? this.glassDef.topY : 374) + 2;
            const jyTop = Math.min(296, mouthY0 - 46);   /* 量酒器悬停顶部 */
            const POUR = 34 * Math.PI / 180;
            /* 瓶子悬停位：倾斜后瓶口正好位于量酒器正上方 */
            const hx = tgtX - b.mouthY * Math.sin(POUR);
            const hy = 200;
            /* 出场 / 回场 / 倾斜 / 回正 */
            const goT = phase(p, 0, 0.15), backT = phase(p, 0.80, 0.96);
            const kk = easeOutCubic(goT) * (1 - easeOutCubic(backT));
            const px = lerp(b.bx, hx, kk);
            const py = lerp(SHELF, hy, kk) - 14 * Math.sin(Math.PI * kk);
            const tilt = 34 * clamp(phase(p, 0.15, 0.28) - phase(p, 0.55, 0.68), 0, 1);
            setAttr(b.node, 'transform', `translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${tilt.toFixed(1)})`);
            const mouth = rot(px, py - b.mouthY, px, py, tilt);
            /* 手（瓶子）在任意进度 pp 处的瓶口位置 —— 对时间做数值微分就得到出口速度。
               于是「手抡得快 → 液流甩得远、落点更偏」是自己长出来的，不用手调参数。 */
            const mouthAt = pp2 => {
              const k2 = easeOutCubic(phase(pp2, 0, 0.15)) * (1 - easeOutCubic(phase(pp2, 0.80, 0.96)));
              const x2 = lerp(b.bx, hx, k2);
              const y2 = lerp(SHELF, hy, k2) - 14 * Math.sin(Math.PI * k2);
              const t2 = 34 * clamp(phase(pp2, 0.15, 0.28) - phase(pp2, 0.55, 0.68), 0, 1);
              return rot(x2, y2 - b.mouthY, x2, y2, t2);
            };
            const DE = 0.003;
            const mA = mouthAt(p - DE), mB = mouthAt(p + DE);
            const vBottle = {
              x: (mB[0] - mA[0]) / (2 * DE * s.dur),
              y: (mB[1] - mA[1]) / (2 * DE * s.dur) + DRIBBLE
            };
            /* 量酒器悬停 + 翻杯 */
            const jop = Math.min(phase(p, 0.02, 0.1), 1 - phase(p, 0.94, 1));
            setAttr(this.jigger.node, 'opacity', jop);
            const tipA = phase(p, 0.58, 0.66), tipB = phase(p, 0.80, 0.88);
            const jang = 118 * Math.min(tipA, 1 - tipB);
            setAttr(this.jigger.node, 'transform', `translate(${(tgtX - this.jigger.x).toFixed(1)},${(jyTop - 466).toFixed(1)}) rotate(${jang.toFixed(1)} ${this.jigger.x - 18} 470)`);
            /* 量酒器：先接酒，再倒出 */
            const jf = clamp(ing.ml / 50, 0.06, 1) * clamp(phase(p, 0.28, 0.55) - phase(p, 0.60, 0.80), 0, 1);
            setAttr(this.jigger.fill, 'y', 508 - jf * 38);
            setAttr(this.jigger.fill, 'height', jf * 38 + 1);
            setAttr(this.jigger.label, 'opacity', jop);
            setText(this.jigger.label, ing.dash ? ing.dash + ' 滴' : ing.ml + ' ml');
            /* 液流一：瓶口 → 量酒器（近乎垂直下落） */
            const visA = p > 0.28 && p < 0.56;
            const visB = p > 0.60 && p < 0.82;
            const w = clamp(2 + ing.ml / 14, 2.4, 7);
            if (visA) {
              const op = Math.min(phase(p, 0.28, 0.34), 1 - phase(p, 0.5, 0.56));
              this._setStream(this.stream, this.splash, { x: mouth[0], y: mouth[1] }, vBottle, jyTop + 4, ing.color, op, w);
            } else if (visB) {
              /* 液流二：量酒器翻杯 → 容器。壶口自身的位移相比自由落体可忽略，
                 出口速度取托里拆利溢出速度（近垂直） */
              const op = Math.min(phase(p, 0.60, 0.66), 1 - phase(p, 0.76, 0.82));
              this._setStream(this.stream, this.splash, { x: tgtX - 13, y: jyTop + 12 }, { x: 12, y: DRIBBLE }, mouthY0, ing.color, op, w * 0.8);
            } else {
              setAttr(this.stream, 'opacity', 0);
              setAttr(this.splash, 'opacity', 0);
            }
            /* 瓶口残滴：倒完后一滴酒**自由落体**掉进量酒器 —— 真重力，落到液面就停下融进去 */
            const ddp = phase(p, 0.84, 0.99);
            if (ddp > 0 && ddp < 1) {
              const tau = ddp * 0.15 * s.dur;                       /* 已下落的秒数 */
              const yDrop = Math.min(130 + 0.5 * GRAV * tau * tau, jyTop + 6);
              setAttr(this.drip, 'cx', tgtX - 4);
              setAttr(this.drip, 'cy', yDrop.toFixed(1));
              setAttr(this.drip, 'fill', ing.color);
              setAttr(this.drip, 'opacity', (Math.sin(Math.PI * ddp) * 0.9 * (1 - phase(ddp, 0.62, 0.95))).toFixed(2));
            }
            this._pouring = true;
            /* 用量标签悬于量酒器上方 */
            const lop = Math.min(phase(p, 0.08, 0.2), 1 - phase(p, 0.8, 0.95));
            setAttr(this.amountLabel, 'opacity', lop);
            setAttr(this.amountLabel, 'x', tgtX);
            setAttr(this.amountLabel, 'y', jyTop - 16);
            this.amountLabel.textContent = `${ing.name} · ${ing.dash ? ing.dash + ' 滴' : ing.ml + ' ml'}`;
            hint = s.label;
          }
          break;
        }

        case 'ice': {
          /* 物理落冰：重力下落 → 砸到底反弹 → 摩擦与自转耗能 → 静止（轨迹在建场景时烘好） */
          const cubes = this.build ? this.glassCubes : this.vesselCubes;
          if (!s._bake) s._bake = this._bakeIce(s.dur, cubes);
          const lt = t >= sEnd ? s.dur : (t - sStart);
          s._bake.cubes.forEach((tr, k) => {
            const cube = cubes[k];
            if (!cube) return;
            setAttr(cube.node, 'transform',
              `translate(${trackAt(tr.x, lt).toFixed(1)},${trackAt(tr.y, lt).toFixed(1)}) rotate(${trackAt(tr.rot, lt).toFixed(1)})`);
            setAttr(cube.node, 'opacity', trackAt(tr.op, lt).toFixed(2));
          });
          if (isCur) hint = s.label;
          break;
        }

        case 'muddle': {
          /* 物理捣压：捣棒有质量（弹簧-阻尼跟随手）、触底速度反射，冲击把薄荷压扁（阻尼弹簧回复） */
          setAttr(this.muddleItems, 'opacity', Math.min(1, phase(p, 0, 0.25) * 2));
          if (isCur) {
            if (!s._bake) s._bake = this._bakeMuddle(s.dur);
            const b = s._bake, lt = t - sStart;
            const drop = phase(p, 0.02, 0.25);
            const sq = trackAt(b.sq, lt);
            const cx = this.gx, cy = 494;
            /* 形变要绕「捣压物自己的中心」缩放，否则整组会被原点拉飞 */
            setAttr(this.muddleItems, 'transform',
              `translate(0,${((1 - easeOutCubic(drop)) * -60).toFixed(1)})` +
              ` translate(${cx},${cy}) scale(1,${(1 - 0.42 * sq).toFixed(3)}) translate(${-cx},${-cy})`);
            setAttr(this.muddler, 'opacity', Math.min(phase(p, 0.05, 0.12), 1));
            setAttr(this.muddler, 'transform', `translate(${this.gx + 3},${trackAt(b.y, lt).toFixed(1)})`);
            hint = s.label;
          }
          break;
        }

        case 'shake': {
          /* 物理摇和：手按真实时间 4.5 Hz 三连击（幅度阻尼衰减），壶内冰块在非惯性系里被甩动、
             撞壁交换动量；松手后壶自由落体砸台面弹两下。全部来自烘焙轨迹。 */
          if (this.vessel) {
            if (isCur) {
              if (!s._bake) s._bake = this._bakeShake(s.dur, this.vesselCubes);
              const b = s._bake, lt = t - sStart;
              setAttr(this.vessel.tilt, 'transform',
                `translate(${trackAt(b.vessel.x, lt).toFixed(1)},${trackAt(b.vessel.y, lt).toFixed(1)})` +
                ` rotate(${trackAt(b.vessel.rot, lt).toFixed(1)},${this.vx},445)`);
              const sp = trackAt(b.vessel.sp, lt);
              if (this.vesselShadow) {
                const lift = clamp(-trackAt(b.vessel.y, lt) / 175, 0, 1);
                setAttr(this.vesselShadow, 'opacity', (1 - lift * 0.72).toFixed(2));
                setAttr(this.vesselShadow, 'rx', (78 + lift * 30).toFixed(1));
                setAttr(this.vesselShadow, 'ry', (12 + lift * 7).toFixed(1));
              }
              /* 动态线强度跟着壶的速度走（原来是 sin 包络，跟速度无关） */
              this.streaks.forEach(sk => setAttr(sk, 'opacity', (clamp(sp / 1600, 0, 1) * 0.72).toFixed(2)));
              b.cubes.forEach((tr, k) => {
                const cube = this.vesselCubes[k];
                if (!cube) return;
                setAttr(cube.node, 'transform',
                  `translate(${trackAt(tr.x, lt).toFixed(1)},${trackAt(tr.y, lt).toFixed(1)}) rotate(${trackAt(tr.rot, lt).toFixed(1)})`);
              });
              hint = s.label;
            } else {
              /* 摇完把冰块归位 —— 原先会停在最后一帧的抖动位置 */
              this.vesselCubes.forEach(cb => setAttr(cb.node, 'transform',
                `translate(${cb.slot[0]},${cb.slot[1]}) rotate(${cb.slot[2]})`));
            }
          }
          break;
        }

        case 'stir':
        case 'stirGlass': {
          if (isCur) {
            const env = Math.min(phase(p, 0, 0.12), 1 - phase(p, 0.88, 1));
            const cx0 = s.type === 'stir' ? this.vx : this.gx;
            const cy0 = s.type === 'stir' ? 460 : lerp(this.glassDef.topY, this.glassDef.botY, 0.55);
            /* 吧匙由手按**真实时间** 0.9 Hz 画圆 —— 原来是 2π·p·3.2，转速会随步骤时长变，
               同一套动作在不同杯里快慢不一，物理上说不通 */
            const th = Math.PI * 2 * 0.9 * (t - sStart);
            const bx = cx0 + Math.cos(th) * 15, by = cy0 + Math.sin(th) * 4.5;
            setAttr(this.spoon, 'opacity', env);
            setAttr(this.spoonLine, 'x1', cx0 + 62);
            setAttr(this.spoonLine, 'y1', cy0 - 152);
            setAttr(this.spoonLine, 'x2', bx.toFixed(1));
            setAttr(this.spoonLine, 'y2', by.toFixed(1));
            this._spoonBowls.forEach(bc => { setAttr(bc, 'cx', bx.toFixed(1)); setAttr(bc, 'cy', by.toFixed(1)); });
            /* 写实吧匙贴图：把「竖图」旋到柄端 → 碗端的连线上。
               竖图本地 +y 轴指向碗端，旋转 θ 后 +y 指向 (-sinθ, cosθ)，
               要它等于 (dx,dy)/len = (cosφ, sinφ)，于是 θ = φ − 90°。 */
            if (this.spoonImg) {
              const sx1 = cx0 + 62, sy1 = cy0 - 152;
              const dx = bx - sx1, dy = by - sy1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const deg = Math.atan2(dy, dx) * 180 / Math.PI - 90;
              const sw = len * this.spoonAsp;
              setAttr(this.spoonImg, 'width', sw.toFixed(1));
              setAttr(this.spoonImg, 'x', (-sw / 2).toFixed(1));
              setAttr(this.spoonImg, 'height', len.toFixed(1));
              setAttr(this.spoonImg, 'transform',
                `translate(${sx1.toFixed(1)},${sy1.toFixed(1)}) rotate(${deg.toFixed(1)})`);
            }
            /* 液面旋涡纹随吧匙旋转 */
            const lvl = s.type === 'stir' ? st.vLevel : st.gLevel;
            const sBot = s.type === 'stir' ? this.vessel.botY : this.glassDef.botY;
            const sH = s.type === 'stir' ? this.vessel.liqH : this.glassDef.liqH;
            if (!s._bake) {
              const cb = s.type === 'stir' ? this.vesselCubes : this.glassCubes;
              s._bake = this._bakeStir(s.dur, cb, 0.9);
              s._cubes = cb;
            }
            const b2 = s._bake, lt2 = t - sStart;
            const spin = trackAt(b2.wl, lt2) / b2.ws;              /* 液体转起来多少（0..1 带惯性） */
            setAttr(this.swirlMark, 'opacity', (env * lvl * 1.6 * clamp(spin, 0, 1)).toFixed(2));
            /* 烘焙里累加的是弧度（ω 按 rad/s 积分），rotate() 要的是度数 —— 别忘换算 */
            const swirlDeg = trackAt(b2.ang, lt2) * 180 / Math.PI;
            setAttr(this.swirlMark, 'transform',
              `translate(${cx0},${(sBot - lvl * sH).toFixed(1)}) rotate(${swirlDeg.toFixed(0)})`);
            /* 杯内冰块：自转滞后于液体，还被离心力慢慢推到外圈 */
            (s._cubes || []).forEach((cube, k) => {
              if (!cube || !b2.ice[k]) return;
              const dir = Math.sign(cube.slot[0] - cx0) || 1;
              const dr = trackAt(b2.ice[k].dr, lt2) * dir;
              const iceDeg = trackAt(b2.ice[k].rot, lt2) * 180 / Math.PI;   /* 同样：弧度 → 度 */
              setAttr(cube.node, 'transform',
                `translate(${(cube.slot[0] + dr).toFixed(1)},${cube.slot[1]}) rotate(${(cube.slot[2] + iceDeg).toFixed(1)})`);
            });
            hint = s.label;
          }
          break;
        }

        case 'strain': {
          /* 物理化滤酒：摇壶被举到杯子上方，倾斜约60°，酒液从壶口垂直落入杯中 */
          const liftT = easeOutCubic(phase(p, 0, 0.22)), backT = easeOutCubic(phase(p, 0.90, 1));
          const k = liftT * (1 - backT);
          const tiltP = phase(p, 0.22, 0.38), tiltBack = phase(p, 0.78, 0.90);
          const tilt = 60 * clamp(tiltP - tiltBack, 0, 1);
          if (isCur && this.vessel) {
            const px = lerp(this.vx, this.gx - 124, k);
            const py = lerp(512, 280, k) - 18 * Math.sin(Math.PI * k);
            setAttr(this.vessel.tilt, 'transform', `translate(${(px - this.vx).toFixed(1)},${(py - 512).toFixed(1)}) rotate(${tilt.toFixed(1)},${this.vx + 34},512)`);
            if (this.vesselShadow) setAttr(this.vesselShadow, 'opacity', (1 - k * 0.8).toFixed(2));
            const vis = p > 0.40 && p < 0.76;
            if (vis) {
              const op = Math.min(phase(p, 0.40, 0.46), 1 - phase(p, 0.70, 0.76));
              const lip = rot(this.vx, 370, this.vx + 34, 512, tilt);
              const sx = lip[0] + (px - this.vx), sy = lip[1] + (py - 512);
              /* 壶口在 pp 处的位置：举壶的手也在动，所以出口速度要叠上它的速度 */
              const lipAt = pp3 => {
                const k3 = easeOutCubic(phase(pp3, 0, 0.22)) * (1 - easeOutCubic(phase(pp3, 0.90, 1)));
                const t3 = 60 * clamp(phase(pp3, 0.22, 0.38) - phase(pp3, 0.78, 0.90), 0, 1);
                const l3 = rot(this.vx, 370, this.vx + 34, 512, t3);
                return [l3[0] + (lerp(this.vx, this.gx - 124, k3) - this.vx),
                        l3[1] + (lerp(512, 280, k3) - 18 * Math.sin(Math.PI * k3) - 512)];
              };
              const lA = lipAt(p - 0.003), lB = lipAt(p + 0.003);
              const vLip = {
                x: (lB[0] - lA[0]) / (0.006 * s.dur),
                y: (lB[1] - lA[1]) / (0.006 * s.dur) + DRIBBLE
              };
              this._setStream(this.stream, this.splash, { x: sx, y: sy }, vLip, this.glassDef.topY + 4, st.gColor, op, 5.5);
            } else {
              setAttr(this.stream, 'opacity', 0);
              setAttr(this.splash, 'opacity', 0);
            }
            this._pouring = true;
            hint = s.label;
          }
          /* 摇和后以冰饮用的古典杯（威士忌酸）：滤酒后投入新鲜冰块 */
          if (this.glassCubes.length && this.c.method === 'shake') {
            this.glassCubes.forEach((cube, kk) => {
              const ci = phase(p, 0.80 + kk * 0.05, 0.95 + kk * 0.05);
              const e = easeOutCubic(ci);
              const y = lerp(cube.slot[1] - 130, cube.slot[1], e);
              setAttr(cube.node, 'transform', `translate(${cube.slot[0]},${y.toFixed(1)}) rotate(${((1 - e) * 140 + cube.slot[2]).toFixed(1)})`);
              setAttr(cube.node, 'opacity', clamp(ci * 3, 0, 1));
            });
          }
          break;
        }

        case 'top': {
          if (isCur) {
            if (!s._root) {
              s._root = el('g', { opacity: 0 }, this.svg);
              s._mouthY = buildBottle(s.top, s._root).mouthY;
              this._topGroups.push(s._root);
            }
            const top = s.top;
            const gtx = this.gx, gty = this.glassDef.topY;
            const appear = phase(p, 0, 0.12);
            const env = Math.min(phase(p, 0.1, 0.2), 1 - phase(p, 0.82, 0.95));
            const ang = 30 * env;
            const pivotX = gtx - 58, pivotY = gty - 8 + (1 - easeOutCubic(appear)) * -46;
            setAttr(s._root, 'opacity', Math.min(1, appear * 2));
            setAttr(s._root, 'transform', `translate(${pivotX},${pivotY}) rotate(${ang.toFixed(1)})`);
            /* 瓶口在 pp 处的位置：瓶子绕着 pivot 转，所以出口速度是它转出来的线速度 + 溢出速度 */
            const mountAt = pp4 => {
              const a4 = 30 * Math.min(phase(pp4, 0.1, 0.2), 1 - phase(pp4, 0.82, 0.95));
              const py4 = gty - 8 + (1 - easeOutCubic(phase(pp4, 0, 0.12))) * -46;
              return rot(gtx - 58, py4 - s._mouthY, gtx - 58, py4, a4);
            };
            const nA = mountAt(p - 0.003), nB = mountAt(p + 0.003);
            const vTop = {
              x: (nB[0] - nA[0]) / (0.006 * s.dur),
              y: (nB[1] - nA[1]) / (0.006 * s.dur) + DRIBBLE
            };
            const mouth = rot(pivotX, pivotY - s._mouthY, pivotX, pivotY, ang);
            const vis = p > 0.14 && p < 0.86;
            if (vis) {
              const op = Math.min(phase(p, 0.14, 0.24), 1 - phase(p, 0.78, 0.88));
              this._setStream(this.stream, this.splash, { x: mouth[0], y: mouth[1] }, vTop, gty + 4, top.color, op, 4.5);
            }
            this._pouring = true;
            hint = s.label;
          }
          break;
        }

        case 'garnish': {
          const g = isCur ? easeOutBack(phase(p, 0.05, 0.62)) : 1;
          const a = this.garnishAnchor;
          setAttr(this.garnishG, 'opacity', clamp(phase(p, 0.02, 0.15) * 2, 0, 1));
          setAttr(this.garnishG, 'transform', `translate(${a.x},${(a.y - (1 - g) * 90).toFixed(1)}) rotate(${((1 - g) * 70).toFixed(1)}) scale(1.15)`);
          if (isCur) hint = s.label;
          break;
        }

        case 'signature': {
          /* 每杯专属的特色画面（泡沫/白霜/盐霜等完成后保留） */
          this._renderFX(p, st);
          if (isCur) hint = s.label;
          break;
        }

        case 'finish': {
          const lift = -16 * Math.sin(Math.PI * phase(p, 0.08, 0.9));
          if (isCur) {
            setAttr(this.glassLift, 'transform', `translate(0,${lift.toFixed(1)})`);
            hint = s.label;
          } else {
            setAttr(this.glassLift, 'transform', 'translate(0,0)');
          }
          const tOp = phase(p, 0.45, 0.75);
          if (tOp > 0) {
            setAttr(this.finishText, 'opacity', tOp);
            this._sparkEls.forEach((sp, k) => {
              const sp2 = phase(p, 0.22 + k * 0.09, 0.5 + k * 0.09);
              const sc = easeOutBack(clamp(sp2, 0, 1));
              setAttr(sp, 'transform', `translate(${sp._base.x},${sp._base.y}) scale(${sc.toFixed(2)})`);
              setAttr(sp, 'opacity', clamp(sp2 * 1.5, 0, 1));
            });
          }
          break;
        }
      }
    }

    if (t >= this.total - 0.001) hint = '完成，请享用';
    /* 液面晃动：由「液流砸到液面」的冲量激发，之后按阻尼振子自己衰减 —— 不再用
       performance.now() 凑正弦（那条曲线跟容器受的扰动毫无关系，拖回同一时刻还会变样）。 */
    const sl = this._sloshAt(t);
    /* 90 是「倾角(rad) → 液面鼓包」的视觉增益：真实倾角只有 0.003 rad 量级，照实画等于看不见。
       上限 0.8 免得鼓成球（本底 ry = 5）。 */
    const slAmp = sl ? Math.min(0.8, Math.abs(sl.angle) * 90) : 0;
    if (this.vessel) {
      setAttr(this.vessel.surface, 'ry', (sl && sl.target === 'vessel' && st.vLevel > 0.02) ? (5 + 4 * slAmp).toFixed(2) : 5);
    }
    setAttr(this.glassSurface, 'ry', (sl && sl.target === 'glass' && st.gLevel > 0.02) ? (5 + 4 * slAmp).toFixed(2) : 5);
    setText(this.hint, hint || '准备开始');
    return { step: this.stepAt(t) };
  };

  /* phys 一并导出：这几个是纯函数（重力、抛射、落点解、液位换算、晃动响应），
     探针里要拿它们做单元级核对，不必为了验一条物理规则去 DOM 里反推。 */
  global.TIPSY = {
    Stage: Stage,
    phys: {
      GRAV: GRAV, DRIBBLE: DRIBBLE,
      projAt: projAt, fallTime: fallTime,
      levelFromVolume: levelFromVolume, sloshImpulse: sloshImpulse, sloshAngle: sloshAngle
    }
  };
})(window);
