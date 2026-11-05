/* 微醺星球 · 音效引擎
   Web Audio 实时合成（零外部文件）：冰块碰撞、倒酒、摇壶、搅拌、捣压、气泡、完成铃。
   首次用户手势时初始化 AudioContext（符合浏览器自动播放策略）。
   音量克制，可开关，选择存 localStorage。 */
'use strict';

(function (global) {
  let ctx = null, master = null;
  let enabled = true;
  try { enabled = localStorage.getItem('tipsy-sound') !== 'off'; } catch (e) { /* 隐私模式 */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /* 首次用户手势时激活音频 */
  window.addEventListener('pointerdown', function () { ensure(); }, { once: true, capture: true });

  function noiseBuffer(dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* 带通滤波噪声突发（液声、沙沙声的基础） */
  function burst(opt) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(opt.dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = opt.freq;
    bp.Q.value = opt.q || 1;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + (opt.delay || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opt.vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + opt.dur + 0.05);
  }

  /* 振荡器单音（冰块叮当、完成铃） */
  function tone(freq, dur, vol, delay, type) {
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + (delay || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  const FX = {
    ice() {
      [0, 0.09, 0.21].forEach(function (d, i) {
        tone(1300 + Math.random() * 900, 0.09, 0.045, d, 'triangle');
        burst({ dur: 0.05, freq: 3200 + i * 900, q: 7, vol: 0.04, delay: d });
      });
    },
    pour() {
      burst({ dur: 0.5, freq: 850, q: 0.9, vol: 0.15 });
      burst({ dur: 0.45, freq: 2300, q: 1.5, vol: 0.05, delay: 0.06 });
    },
    strain() {
      burst({ dur: 0.75, freq: 1400, q: 1.2, vol: 0.1 });
      burst({ dur: 0.6, freq: 3000, q: 2, vol: 0.03, delay: 0.08 });
    },
    shake() {
      for (let i = 0; i < 9; i++) {
        burst({ dur: 0.07, freq: 1100 + (i % 3) * 500, q: 0.8, vol: 0.09, delay: i * 0.135 });
      }
    },
    stir() {
      for (let i = 0; i < 5; i++) tone(1050 + Math.random() * 650, 0.05, 0.028, i * 0.36, 'triangle');
    },
    muddle() {
      tone(165, 0.09, 0.13, 0, 'sine');
      tone(150, 0.09, 0.11, 0.28, 'sine');
    },
    top() {
      burst({ dur: 0.8, freq: 4200, q: 0.6, vol: 0.055 });
    },
    ding() {
      tone(1046, 0.55, 0.11, 0, 'sine');
      tone(1568, 0.65, 0.07, 0.1, 'sine');
    }
  };

  global.TIPSY_SFX = {
    play: function (name) {
      if (!enabled || !ensure()) return;
      try { if (FX[name]) FX[name](); } catch (e) { /* 音频异常静默 */ }
    },
    setEnabled: function (v) {
      enabled = !!v;
      try { localStorage.setItem('tipsy-sound', enabled ? 'on' : 'off'); } catch (e) { }
      if (enabled) ensure();
    },
    getEnabled: function () { return enabled; }
  };
})(window);
