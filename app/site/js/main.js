/* 微醺星球 · 主逻辑：星空 / 酒单卡片 / 路由 / 步骤播放器 */
'use strict';

(function () {

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 详情页里那几个节点是 index.html 写死的静态标记，memo 一次就够 ——
     播放中每帧再 querySelector 一遍纯属浪费。动态生成的（步骤 chip 等）不能走这里。 */
  const _nodes = {};
  const node = s => _nodes[s] || (_nodes[s] = $(s));

  /* 捣压材料的图：名称与 ASSETS 的键不一一对应（「青柠角」用青柠轮片那张），单独映射 */
  const MUDDLE_ASSET = {
    '薄荷叶': ['gar', 'mint'],
    '青柠角': ['gar', 'lime-wheel'],
    '糖浆': ['ing', '糖浆']
  };

  /* 材料行：左侧写实小图（图挂了显示底下的色块）→ 名称 → 类型 → 用量 */
  function ingRow(o, amountText, extraClass) {
    const url = assetUrl('ing', o.name);
    return `<li class="ing-row${extraClass ? ' ' + extraClass : ''}">
        <span class="ing-thumb${url ? '' : ' no-img'}">
          <i class="ing-swatch" style="background:${o.color}"></i>
          ${url ? `<img alt="" decoding="async" loading="lazy" src="${url}">` : ''}
        </span>
        <span class="ing-name">${o.name}<em>${o.en}</em></span>
        <span class="ing-type">${o.type}</span>
        <span class="ing-amount">${amountText}</span>
      </li>`;
  }

  /* ---------- 星空（只在暗黑模式可见，按需构建 —— 明亮模式不建这些 span） ---------- */
  let starsBuilt = false;
  function buildStars() {
    if (starsBuilt) return;
    const wrap = $('.stars');
    if (!wrap) return;
    starsBuilt = true;
    const n = window.innerWidth < 700 ? 70 : 140;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      const size = Math.random() < 0.85 ? 1.5 : 2.5;
      s.style.cssText =
        `left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;` +
        `width:${size}px;height:${size}px;` +
        `animation-delay:${(Math.random() * 6).toFixed(2)}s;` +
        `animation-duration:${(2.5 + Math.random() * 4).toFixed(2)}s;` +
        (Math.random() < 0.25 ? 'background:#f0c584;' : '');
      frag.appendChild(s);
    }
    wrap.appendChild(frag);
  }
  function syncStars() {
    if (document.documentElement.dataset.theme === 'dark') buildStars();
  }

  /* ---------- 卡片迷你杯型 ---------- */
  const MINI = {
    rocks: {
      d: 'M25 64 L65 64 L60 106 L30 106 Z',
      liquid: 'M29 78 L61 78 L58 103 L32 103 Z', garnish: [66, 62]
    },
    highball: {
      d: 'M33 26 L57 26 L54 106 L36 106 Z',
      liquid: 'M37 44 L53 44 L51 103 L39 103 Z', garnish: [58, 24]
    },
    coupe: {
      d: 'M18 52 A 27 24 0 0 0 72 52 M45 74 L45 100 M33 102 L57 102',
      liquid: 'M24 52 A 21 17 0 0 0 66 52 Z', garnish: [72, 50], stem: true
    },
    martini: {
      d: 'M17 50 L45 80 L73 50 M45 80 L45 102 M33 104 L57 104',
      liquid: 'M26 54 L45 76 L64 54 Z', garnish: [72, 48], stem: true
    },
    wine: {
      d: 'M24 32 C24 62 36 72 45 76 C54 72 66 62 66 32 M45 76 L45 102 M31 104 L59 104',
      liquid: 'M29 42 C29 62 37 70 45 73 C53 70 61 62 61 42 Z', garnish: [66, 30], stem: true
    }
  };
  const GARNISH_COLOR = {
    'lime-wheel': '#a8cf6e', 'lemon-slice': '#e3d75e', 'orange-slice': '#f0923c',
    'orange-peel': '#f0923c', 'lemon-twist': '#e8dd6e', 'mint': '#4f9450',
    'cherry': '#c2273d', 'coffee-beans': '#2f1a10'
  };

  function miniGlassSVG(c) {
    const m = MINI[c.glass];
    const g = GARNISH_COLOR[c.garnish] || '#f0c584';
    let garnish = '';
    if (m.garnish) {
      garnish = `<circle cx="${m.garnish[0]}" cy="${m.garnish[1]}" r="5" fill="${g}" opacity=".9"/>`;
    }
    const liquid = `<path d="${m.liquid}" fill="${c.color}" opacity=".85"/>`;
    const hull = m.stem ? 'none' : 'rgba(255,255,255,0.05)';
    /* 杯身轮廓（有脚杯不填充、只留描边）→ 酒液 → 再用同一条轮廓描一遍边保证清晰 */
    return `<svg viewBox="0 0 90 120" aria-hidden="true" class="mini-glass">
      <path d="${m.d}" fill="${hull}" stroke="rgba(232,240,250,0.55)" stroke-width="2" stroke-linecap="round"/>
      ${liquid}
      <path d="${m.d}" fill="none" stroke="rgba(232,240,250,0.55)" stroke-width="2"/>
      ${garnish}
    </svg>`;
  }

  /* ---------- 做法卡片 ---------- */
  function methodIcon(method) {
    if (method === 'shake') {
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 10 h14 l-2 14 h-10 z" fill="rgba(232,165,75,0.15)"/>
        <path d="M15 6 h18"/>
        <path d="M28 32 q6 5 0 10"/>
        <path d="M20 32 q-6 5 0 10"/>
      </svg>`;
    }
    if (method === 'stir') {
      return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 26 h20 l-3 16 h-14 z" fill="rgba(232,165,75,0.15)"/>
        <path d="M30 24 L40 6"/>
        <ellipse cx="29" cy="25" rx="4" ry="3" fill="rgba(232,165,75,0.3)"/>
        <path d="M18 30 q6 3 12 0" opacity=".6"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 8 h8 l-1.5 6 h-5 z"/>
      <path d="M20 14 l1 6 M28 14 l-1 6"/>
      <path d="M14 30 h20 l-3 14 h-14 z" fill="rgba(232,165,75,0.15)"/>
      <path d="M24 20 l0 8" stroke-dasharray="2 4"/>
    </svg>`;
  }

  function initMethods() {
    const grid = $('#methods-grid');
    if (!grid) return;
    grid.innerHTML = ['shake', 'stir', 'build'].map(m => {
      const info = METHOD_INFO[m];
      /* 顶部写实横幅（与酒单卡片同一视觉语言），线稿图标留着当降级 —— 图在 EO 域名上 */
      return `<div class="method-card reveal">
        <div class="method-photo">
          <img alt="" decoding="async" height="400" loading="lazy" src="${info.img}" width="640">
          <span class="method-photo-fallback">${methodIcon(m)}</span>
        </div>
        <div class="method-body">
          <h3>${info.name}<span class="method-en">${info.en}</span></h3>
          <p>${info.short}</p>
        </div>
      </div>`;
    }).join('');
    /* 与卡片图同一套降级：图挂了就露出线稿，不留空横幅 */
    $$('#methods-grid .method-photo img').forEach(img => {
      img.addEventListener('error', () => {
        const box = img.closest('.method-photo');
        if (box) box.classList.add('photo-failed');
      }, { once: true });
    });
  }

  /* ---------- 酒单 ---------- */
  function initMenu() {
    const grid = $('#cocktail-grid');
    if (!grid) return;
    grid.innerHTML = COCKTAILS.map((c, i) => {
      const dots = abvDots(c.abv);
      const diff = ['入门', '进阶', '熟练'][c.difficulty - 1];
      return `<a class="cocktail-card reveal" href="#/cocktail/${c.id}" style="--index:${i}" aria-label="学习制作${c.name}">
        <div class="card-photo">
          <img alt="" decoding="async" height="400" loading="lazy" src="${c.img}" width="640">
          <!-- 图挂在 EO 域名上：离线 / 被墙 / 图挂了就露出这枚矢量小杯（initMenu 末尾挂了 error 监听） -->
          <span class="card-photo-fallback">${miniGlassSVG(c)}</span>
        </div>
        <div class="card-info">
          <div class="card-title-row">
            <h3>${c.name}</h3>
            <span class="method-badge m-${c.method}">${METHOD_INFO[c.method].name}</span>
          </div>
          <p class="card-en">${c.en}</p>
          <p class="card-tagline">${c.tagline}</p>
          <div class="card-meta">
            <span class="meta-item">${c.ingredients[0].name}</span>
            <span class="meta-sep"></span>
            <span class="meta-item abv" title="酒精度约 ${c.abv}%">
              <span class="dots">${[0, 1, 2, 3, 4].map(k => `<i class="${k < dots ? 'on' : ''}"></i>`).join('')}</span>
              ${c.abv}% ABV
            </span>
            <span class="meta-sep"></span>
            <span class="meta-item">${diff}</span>
          </div>
        </div>
      </a>`;
    }).join('');

    /* 卡片图挂在 EO 域名上（离网、被墙、图被删都可能失败）：
       失败就把矢量小杯露出来兜底，别让 12 张卡片开天窗。 */
    $$('#cocktail-grid .card-photo img').forEach(img => {
      img.addEventListener('error', () => {
        const box = img.closest('.card-photo');
        if (box) box.classList.add('photo-failed');
      }, { once: true });
    });
  }

  /* ---------- 滚动进场 ---------- */
  function initReveal() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    $$('.reveal').forEach(n => io.observe(n));
  }

  /* ---------- 详情页 ---------- */
  let stage = null, player = null, rafId = 0, currentOpen = null, homeScroll = 0, lastTrigger = null;

  function findCocktail(id) {
    return COCKTAILS.find(c => c.id === id);
  }

  /* 入口卡片：关详情时把焦点还给它，键盘用户才不会掉到页面顶部重数一遍 */
  function triggerOf(id) {
    return document.querySelector('a.cocktail-card[href="#/cocktail/' + id + '"]');
  }

  function openDetail(c) {
    if (currentOpen === c.id) return;
    currentOpen = c.id;
    lastTrigger = triggerOf(c.id);
    homeScroll = window.scrollY || 0;
    document.body.classList.add('detail-mode');
    $('#home').hidden = true;
    const detail = $('#detail');
    detail.hidden = false;
    window.scrollTo(0, 0);

    /* 文案 */
    $('#d-name').textContent = c.name;
    $('#d-en').textContent = c.en;
    $('#d-tagline').textContent = c.tagline;
    $('#d-story').textContent = c.story;
    $('#d-method').textContent = METHOD_INFO[c.method].name + ' · ' + METHOD_INFO[c.method].en;
    $('#d-method-desc').textContent = '关于' + METHOD_INFO[c.method].name + '：' + METHOD_INFO[c.method].desc;

    /* 材料清单：每行左侧一张写实小图（与舞台酒瓶贴图共用同一批素材）；
       图挂在 EO 域名上，失败就退回原来的色块 —— 色块一直在 DOM 里，只是被图盖住 */
    $('#d-ingredients').innerHTML =
      c.ingredients.map(ing => ingRow(ing, fmtAmount(ing))).join('') +
      (c.tops || []).map(t => ingRow(t, t.ml + ' ml / 补满', 'is-top')).join('');
    $$('#d-ingredients .ing-thumb img').forEach(img => {
      img.addEventListener('error', () => {
        const box = img.closest('.ing-thumb');
        if (box) box.classList.add('no-img');
      }, { once: true });
    });

    /* 捣压材料 */
    const mBox = $('#d-muddle');
    if (c.muddleItems) {
      mBox.hidden = false;
      $('#d-muddle-items').innerHTML = c.muddleItems.map(m => {
        const a = MUDDLE_ASSET[m.name];
        const url = a ? assetUrl(a[0], a[1]) : '';
        return `<li>
          <span class="ing-thumb${url ? '' : ' no-img'}">
            <i class="ing-swatch" style="background:var(--line)"></i>
            ${url ? `<img alt="" decoding="async" loading="lazy" src="${url}">` : ''}
          </span>
          <span class="m-name">${m.name}</span><span>${m.amount}</span>
        </li>`;
      }).join('');
      $$('#d-muddle-items .ing-thumb img').forEach(img => {
        img.addEventListener('error', () => {
          const box = img.closest('.ing-thumb');
          if (box) box.classList.add('no-img');
        }, { once: true });
      });
    } else {
      mBox.hidden = true;
    }

    /* 信息栏 */
    const meta = [];
    meta.push(['杯型', GLASS_NAMES[c.glass]]);
    meta.push(['做法', METHOD_INFO[c.method].name + ' ' + METHOD_INFO[c.method].en]);
    if (c.rim) meta.push(['杯口', c.rim === 'salt' ? '盐边' : '糖边']);
    const gUrl = c.garnish ? assetUrl('gar', c.garnish) : '';
    meta.push(['装饰', (gUrl ? `<img alt="" class="meta-gar" decoding="async" loading="lazy" src="${gUrl}">` : '') + c.garnishName]);
    meta.push(['器材', METHOD_INFO[c.method].equip.join(' · ')]);
    meta.push(['酒精度', '约 ' + c.abv + '% ABV']);
    $('#d-meta').innerHTML = meta.map(m =>
      `<div class="meta-row"><span class="meta-k">${m[0]}</span><span class="meta-v">${m[1]}</span></div>`).join('');

    /* 舞台与播放器 */
    stage = new TIPSY.Stage(c, node('#stage-host'));
    buildControls(stage);
    player = { t: 0, playing: !reduced, last: performance.now() };
    lastStepIdx = -1;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    syncPlayBtn();
    startLoop();
    /* 无障碍：视图切换后把焦点搬到详情标题（此时整页的 h1），读屏先念酒名，
       键盘用户的 Tab 也从详情开头数起 —— 否则焦点会掉在 body 上、从页面顶部重来 */
    const title = node('#d-name');
    if (title) title.focus({ preventScroll: true });
  }

  function closeDetail() {
    if (currentOpen === null && $('#detail').hidden) return;
    currentOpen = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    stage = null;
    player = null;
    document.body.classList.remove('detail-mode');
    $('#detail').hidden = true;
    $('#home').hidden = false;
    /* 回到酒单时恢复之前的浏览位置（instant 覆盖 CSS 平滑滚动） */
    window.scrollTo({ top: homeScroll, behavior: 'instant' });
    /* 焦点还给入口卡片 —— 只在「返回酒单」（hash 清空）时做：点导航锚点跳转时别抢焦点。
       preventScroll 是为了别把刚恢复的浏览位置又滚走。 */
    if (!location.hash && lastTrigger && lastTrigger.isConnected) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  }

  /* ---------- 播放器 ---------- */
  function buildControls(stg) {
    const chips = $('#step-chips');
    const tls = $('#timeline-steps');
    chips.innerHTML = '';
    tls.innerHTML = '';
    stg.steps.forEach((s, i) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = s.short;
      chip.addEventListener('click', () => {
        player.t = stg.times[i] + 0.001;
        player.playing = true;
        syncPlayBtn();
        startLoop();
      });
      chips.appendChild(chip);
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = (stg.times[i] / stg.total * 100) + '%';
      tls.appendChild(tick);
    });
  }

  let lastStepIdx = -1;

  function loop(ts) {
    if (!player || !stage) return;
    const dt = Math.min(0.05, (ts - player.last) / 1000);
    player.last = ts;
    if (player.playing) {
      player.t += dt;
      if (player.t >= stage.total) {
        player.t = stage.total;
        player.playing = false;
        syncPlayBtn();
      }
    }
    renderFrame();
    /* 只在播放中续帧；暂停后停掉 rAF，靠交互按需 renderFrame，避免空转烧 CPU */
    rafId = player.playing ? requestAnimationFrame(loop) : 0;
  }

  /* 渲染当前帧 + 同步周边 UI（进度条 / 时间 / 步骤高亮 / 播报）。
     必须和 stage.render 绑在一起走：暂停后 rAF 停了，交互（拖时间轴 / 方向键）只调 render 的话，
     SVG 动了但进度条、时间标签、aria-valuenow 与播报区全都不动。 */
  function renderFrame() {
    if (!player || !stage) return null;
    const r = stage.render(player.t);
    syncUI(r);
    return r;
  }

  function syncUI(r) {
    /* 进度条与时间 */
    const pct = stage.total ? player.t / stage.total * 100 : 0;
    const tl = node('#timeline'), clock = node('#time-label');
    node('#timeline-fill').style.width = pct + '%';
    node('#timeline-handle').style.left = pct + '%';
    tl.setAttribute('aria-valuenow', Math.round(pct));
    const secs = Math.floor(player.t);
    clock.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    tl.setAttribute('aria-valuetext', stage.steps[r.step].label + '，' + clock.textContent);

    if (r.step === lastStepIdx) return;
    lastStepIdx = r.step;
    /* 步骤切换时触发对应音效（拖动进度时不响，避免噪音） */
    const s = stage.steps[r.step];
    const SND = {
      ice: 'ice', pour: 'pour', shake: 'shake', stir: 'stir', stirGlass: 'stir',
      strain: 'strain', top: 'top', muddle: 'muddle', garnish: null, signature: null, finish: 'ding'
    };
    if (player.playing && SND[s.type]) TIPSY_SFX.play(SND[s.type]);
    const chips = $$('#step-chips .chip');
    chips.forEach((ch, k) => {
      const on = k === r.step;
      ch.classList.toggle('active', on);
      if (on) ch.setAttribute('aria-current', 'true');
      else ch.removeAttribute('aria-current');
    });
    /* 无障碍：把当前步骤播报给屏幕阅读器（视觉用户看动画，读屏用户听文字） */
    const live = $('#stage-live');
    if (live) live.textContent = '第 ' + (r.step + 1) + ' / ' + stage.steps.length + ' 步：' + s.label;
    /* 当前 chip 滚入可视区（仅横向滚动 chips 容器，不影响页面） */
    const cur = chips[r.step], box = $('#step-chips');
    if (cur && box) {
      const l = cur.offsetLeft, w = cur.offsetWidth;
      if (l < box.scrollLeft || l + w > box.scrollLeft + box.clientWidth - 8) {
        box.scrollTo({ left: l - box.clientWidth / 2 + w / 2, behavior: reduced ? 'auto' : 'smooth' });
      }
    }
  }

  function startLoop() {
    if (!player || !stage || rafId) return;
    player.last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function syncPlayBtn() {
    const b = $('#btn-play');
    if (!b) return;
    b.classList.toggle('is-playing', !!(player && player.playing));
    b.setAttribute('aria-label', player && player.playing ? '暂停' : '播放');
  }

  function seekByClientX(x) {
    const tl = $('#timeline');
    const rect = tl.getBoundingClientRect();
    const f = clamp01((x - rect.left) / rect.width);
    player.t = f * stage.total;
    renderFrame();
  }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  function initControls() {
    const btnPlay = $('#btn-play');
    const btnRestart = $('#btn-restart');
    const tl = $('#timeline');
    let dragging = false;

    /* 返回按钮：JS 接管，避免 href="#top" 的原生锚点滚动覆盖位置恢复 */
    $('#back-btn').addEventListener('click', e => {
      e.preventDefault();
      if (location.hash) location.hash = '';
    });

    btnPlay.addEventListener('click', () => {
      if (!player) return;
      if (!player.playing && player.t >= stage.total - 0.01) player.t = 0;
      player.playing = !player.playing;
      player.last = performance.now();
      syncPlayBtn();
      if (player.playing) startLoop();
    });
    btnRestart.addEventListener('click', () => {
      if (!player) return;
      player.t = 0;
      player.playing = true;
      player.last = performance.now();
      syncPlayBtn();
      startLoop();
    });

    const down = e => {
      if (!player || !stage) return;
      dragging = true;
      tl.classList.add('dragging');
      seekByClientX(e.clientX);
    };
    const move = e => { if (dragging) seekByClientX(e.clientX); };
    const up = () => { dragging = false; tl.classList.remove('dragging'); };
    tl.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    /* 音效开关 */
    const btnSound = $('#btn-sound');
    const syncSoundBtn = () => {
      if (!btnSound) return;
      btnSound.classList.toggle('muted', !TIPSY_SFX.getEnabled());
      btnSound.setAttribute('aria-label', TIPSY_SFX.getEnabled() ? '关闭音效' : '开启音效');
    };
    btnSound.addEventListener('click', () => {
      TIPSY_SFX.setEnabled(!TIPSY_SFX.getEnabled());
      syncSoundBtn();
    });
    syncSoundBtn();

    /* 键盘 */
    $('#stage-host').addEventListener('keydown', e => {
      if (!player || !stage) return;
      if (e.code === 'Space') {
        e.preventDefault();
        btnPlay.click();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        player.t = Math.min(stage.total, player.t + 2);
        renderFrame();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        player.t = Math.max(0, player.t - 2);
        renderFrame();
      }
    });
    tl.addEventListener('keydown', e => {
      if (!player || !stage) return;
      if (e.code === 'ArrowRight') { e.preventDefault(); player.t = Math.min(stage.total, player.t + 2); renderFrame(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); player.t = Math.max(0, player.t - 2); renderFrame(); }
    });
  }

  /* ---------- 路由 ---------- */
  function route() {
    const m = location.hash.match(/^#\/cocktail\/([\w-]+)$/);
    if (m) {
      const c = findCocktail(m[1]);
      if (c) { openDetail(c); return; }
    }
    closeDetail();
  }

  /* ---------- 主题切换 ---------- */
  function initThemeToggle() {
    const btn = $('#theme-toggle');
    if (!btn) return;
    const sync = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      btn.setAttribute('aria-label', dark ? '切换到明亮模式' : '切换到暗黑模式');
      btn.title = dark ? '切换到明亮模式' : '切换到暗黑模式';
    };
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('tipsy-theme', next); } catch (e) { /* 隐私模式下忽略 */ }
      syncStars();
      sync();
    });
    sync();
  }

  /* ---------- 启动 ---------- */
  syncStars();
  initMethods();
  initMenu();
  initReveal();
  initControls();
  initThemeToggle();
  window.addEventListener('hashchange', route);
  window.addEventListener('load', route);
  route();
})();
