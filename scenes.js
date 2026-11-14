/* Drives the extra pinned 3D sections (portrait intro, laptop).
   Each <section data-scene="GlobalName"> holds a sticky pin with a canvas and chapters that carry data-start / data-end.
   The global (window.PortraitScene, window.LaptopScene) implements init / render(progress, timeMs) / resize. */
(function () {
  'use strict';
  var win = window, doc = document;
  var reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Scroll-scrubbed image sequence (e.g. the telephone). Frames: <base>/f_0001.webp …, count from <base>/manifest.json. */
  function makeSeqApi(base) {
    var ctx, cv, frames = [], count = 0, W = 1, H = 1, DPR = 1, last = -1, loadedAny = false;
    function nearest(i) {
      for (var d = 0; d < count; d++) {
        if (frames[i - d] && frames[i - d].ok) return frames[i - d];
        if (frames[i + d] && frames[i + d].ok) return frames[i + d];
      }
      return null;
    }
    function blit(img, alpha) {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var s = Math.max(W / iw, H / ih), dw = iw * s, dh = ih * s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
    // draws frame floor(f) and blends the next frame on top by the fractional part: smooth scrubbing
    function draw(fi) {
      var i0 = Math.floor(fi), i1 = Math.min(count - 1, i0 + 1), a = fi - i0;
      var base = nearest(i0);
      if (!base) return false;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      blit(base.img, 1);
      if (a > 0.02 && frames[i1] && frames[i1].ok && frames[i0] && frames[i0].ok) blit(frames[i1].img, a);
      return frames[i0] && frames[i0].ok;
    }
    return {
      ready: true,
      init: function (canvas) {
        cv = canvas; ctx = canvas.getContext('2d');
        if (!ctx) return false;
        fetch(base + '/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
          if (!m || !m.count) return;
          count = m.count;
          var order = [0];
          for (var k = 1; k < count; k++) order.push(k);
          order.forEach(function (k) {
            var img = new Image();
            var rec = { img: img, ok: false };
            frames[k] = rec;
            img.decoding = 'async';
            img.onload = function () { rec.ok = true; loadedAny = true; last = -1; };
            img.src = base + '/f_' + String(k + 1).padStart(4, '0') + '.' + (m.ext || 'webp');
          });
        }).catch(function () {});
        return true;
      },
      resize: function (w, h, dpr) {
        W = w; H = h; DPR = dpr || 1;
        cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
        last = -1;
      },
      render: function (p) {
        if (!count) return;
        var fi = clamp(p, 0, 1) * (count - 1);
        var key = Math.round(fi * 100);
        if (key === last) return;
        if (draw(fi)) last = key; else last = -1;
      }
    };
  }

  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* Résumé dashboard drawn once into an offscreen canvas; shown on the laptop screen. */
  function makeDashboard() {
    var c = doc.createElement('canvas'), w = 1184, h = 694;
    c.width = w * 2; c.height = h * 2; // drawn at 2x so it stays sharp when the camera zooms in
    var g = c.getContext('2d');
    var BLUE = '#3b82f6', FG = '#f5f5f5', MUT = '#8c8c8c', PANEL = '#121418', LINE = 'rgba(255,255,255,0.09)';
    function rr(x, y, ww, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); }
    function draw() {
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, w, h);
      var grd = g.createRadialGradient(w * 0.8, -40, 10, w * 0.8, -40, w * 0.7);
      grd.addColorStop(0, 'rgba(59,130,246,0.22)'); grd.addColorStop(1, 'rgba(59,130,246,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      // window bar
      g.fillStyle = '#111317'; g.fillRect(0, 0, w, 44);
      ['#ff5f57', '#febc2e', '#28c840'].forEach(function (col, i) { g.fillStyle = col; g.beginPath(); g.arc(26 + i * 22, 22, 6, 0, Math.PI * 2); g.fill(); });
      g.font = '500 15px "JetBrains Mono", monospace'; g.fillStyle = MUT; g.textAlign = 'center';
      g.fillText('ashutosh-kumar — résumé.app', w / 2, 27);
      g.textAlign = 'left';
      // title
      g.font = '500 14px "JetBrains Mono", monospace'; g.fillStyle = BLUE; g.fillText('› PROFILE LOADED', 40, 92);
      g.font = '800 46px "Sora", "Inter", sans-serif'; g.fillStyle = FG; g.fillText('FROM BA TO BD', 40, 146);
      g.fillStyle = BLUE; g.fillText('.', 40 + g.measureText('FROM BA TO BD').width, 146);
      g.font = '400 18px "Inter", sans-serif'; g.fillStyle = MUT; g.fillText('Business Analyst  →  Business Development · Chennai, India', 40, 180);
      // KPI tiles
      var tiles = [['10 days', 'Team Lead recognition'], ['2', 'Live P1 clients, month one'], ['1,346', 'Outreach in 2 months'], ['34', 'Client meetings, FarmwiseAI']];
      var tw = (w - 80 - 3 * 16) / 4;
      tiles.forEach(function (t, i) {
        var x = 40 + i * (tw + 16), y = 210;
        rr(x, y, tw, 118, 12); g.fillStyle = PANEL; g.fill(); g.strokeStyle = LINE; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = BLUE; g.fillRect(x + 18, y + 18, 22, 3);
        g.font = '800 34px "Sora", sans-serif'; g.fillStyle = FG; g.fillText(t[0], x + 18, y + 66);
        g.font = '400 15px "Inter", sans-serif'; g.fillStyle = MUT; g.fillText(t[1], x + 18, y + 96);
      });
      // pipeline
      var py = 372;
      g.font = '500 13px "JetBrains Mono", monospace'; g.fillStyle = MUT; g.fillText('DELIVERY PIPELINE', 40, py);
      var stages = ['LEAD', 'DEMO', 'REQUIREMENTS', 'UAT', 'GO-LIVE', 'SUPPORT'];
      var sx = 40, sy = py + 22, gap = 14;
      g.font = '600 14px "JetBrains Mono", monospace';
      var widths = stages.map(function (s) { return g.measureText(s).width + 34; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (stages.length - 1);
      var scaleX = (w - 80) / total;
      var x = sx;
      g.strokeStyle = 'rgba(59,130,246,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy + 20); g.lineTo(w - 40, sy + 20); g.stroke();
      stages.forEach(function (s, i) {
        var ww = widths[i] * scaleX;
        rr(x, sy, ww, 40, 20); g.fillStyle = i === 2 ? BLUE : '#0f1115'; g.fill(); g.strokeStyle = i === 2 ? BLUE : 'rgba(255,255,255,0.18)'; g.stroke();
        g.fillStyle = i === 2 ? '#fff' : FG; g.textAlign = 'center'; g.fillText(s, x + ww / 2, sy + 25); g.textAlign = 'left';
        x += ww + gap * scaleX;
      });
      // timeline
      var ty = 500;
      g.font = '500 13px "JetBrains Mono", monospace'; g.fillStyle = MUT; g.fillText('TIMELINE', 40, ty);
      var items = [['2021', 'PERI', 'B.E. ECE · 7.53'], ['2024', 'MX Omega', 'Web Dev Intern'], ['2025', 'Shreyas Tech', 'Business Analyst'], ['2026', 'FarmwiseAI', 'BD Intern · intl. pipeline']];
      var iw = (w - 80) / 4;
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(40, ty + 30); g.lineTo(w - 40, ty + 30); g.stroke();
      items.forEach(function (it, i) {
        var x = 40 + i * iw;
        g.fillStyle = i === 3 ? BLUE : '#0a0b0e'; g.strokeStyle = i === 3 ? BLUE : 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
        g.beginPath(); g.arc(x + 7, ty + 30, 7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.font = '800 30px "Sora", sans-serif'; g.fillStyle = FG; g.fillText(it[0], x, ty + 82);
        g.font = '600 17px "Inter", sans-serif'; g.fillStyle = FG; g.fillText(it[1], x, ty + 110);
        g.font = '400 15px "Inter", sans-serif'; g.fillStyle = MUT; g.fillText(it[2], x, ty + 134);
      });
      g.font = '500 12px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillText('B2B SAAS · PRE-SALES · BUSINESS ANALYSIS · BUSINESS DEVELOPMENT', 40, h - 22);
    }
    draw();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { draw(); c.__v = (c.__v || 0) + 1; });
    return c;
  }

  /* Laptop: opening frames, then the dashboard fades onto the screen, then the camera pushes into it. */
  function makeLaptopApi(base) {
    var ctx, cv, imgs = [], ok = [], count = 0, W = 1, H = 1, DPR = 1, key = '';
    var dash = makeDashboard();
    var FW = 1280, FH = 720;
    var Q = [[297, 112], [885, 112], [890, 467], [289, 467]];
    var SC = [589, 290];
    function nearest(i) {
      for (var d = 0; d < count; d++) { if (ok[i - d]) return i - d; if (ok[i + d]) return i + d; }
      return -1;
    }
    return {
      ready: true,
      init: function (canvas) {
        cv = canvas; ctx = canvas.getContext('2d');
        if (!ctx) return false;
        fetch(base + '/manifest.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
          if (!m || !m.count) return;
          count = m.count;
          for (var k = 0; k < count; k++) (function (k) {
            var im = new Image(); im.decoding = 'async';
            im.onload = function () { ok[k] = true; key = ''; };
            im.src = base + '/f_' + String(k + 1).padStart(4, '0') + '.' + (m.ext || 'webp');
            imgs[k] = im;
          })(k);
        }).catch(function () {});
        return true;
      },
      resize: function (w, h, dpr) { W = w; H = h; DPR = dpr || 1; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); key = ''; },
      render: function (p) {
        if (!count) return;
        // timeline: 0-0.55 lid opens (frames, cross-faded) · 0.5-0.62 dashboard lights up
        //           0.52-0.64 laptop glides to centre · 0.66-1 slow push-in to the screen
        var open = clamp(p / 0.55, 0, 1);
        var fi = open * (count - 1);
        var i0 = Math.floor(fi), i1 = Math.min(count - 1, i0 + 1), fa = fi - i0;
        var idx = nearest(i0);
        if (idx < 0) return;
        var a = smoothstep((p - 0.5) / 0.12);
        var z = 1 + 0.85 * smoothstep((p - 0.66) / 0.34);
        var glide = smoothstep((p - 0.52) / 0.12);
        var k2 = Math.round(fi * 100) + '|' + a.toFixed(3) + '|' + z.toFixed(4) + '|' + glide.toFixed(3) + '|' + W + 'x' + H + '|' + (dash.__v || 0);
        if (k2 === key) return;
        key = k2;
        var mobile = W < 760, sc0, dx, dy;
        if (mobile) {
          sc0 = W / FW * 1.6; dx = (W - FW * sc0) / 2; dy = H * 0.1 - FH * sc0 * 0.08;
        } else {
          sc0 = Math.max(H / FH * 1.0, W / FW * 0.7);
          dx = (W - FW * sc0) / 2 + W * 0.13 * (1 - glide); dy = (H - FH * sc0) / 2 + H * 0.02;
        }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(dx, dy); ctx.scale(sc0, sc0);
        ctx.translate(SC[0], SC[1]); ctx.scale(z, z); ctx.translate(-SC[0], -SC[1]);
        ctx.drawImage(imgs[idx], 0, 0, FW, FH);
        if (fa > 0.02 && idx === i0 && ok[i1]) { ctx.globalAlpha = fa; ctx.drawImage(imgs[i1], 0, 0, FW, FH); ctx.globalAlpha = 1; }
        if (a > 0.001) {
          ctx.save();
          ctx.beginPath(); ctx.moveTo(Q[0][0], Q[0][1]); ctx.lineTo(Q[1][0], Q[1][1]); ctx.lineTo(Q[2][0], Q[2][1]); ctx.lineTo(Q[3][0], Q[3][1]); ctx.closePath(); ctx.clip();
          ctx.globalAlpha = a;
          ctx.drawImage(dash, 287, 110, 606, 359);
          ctx.restore();
          // the floor reflection: darken the white glow and show a faint mirrored dashboard
          ctx.save();
          ctx.beginPath(); ctx.moveTo(293, 598); ctx.lineTo(885, 598); ctx.lineTo(890, FH); ctx.lineTo(288, FH); ctx.closePath(); ctx.clip();
          ctx.globalAlpha = a * 0.92; ctx.fillStyle = '#000'; ctx.fillRect(280, 590, 620, FH - 590);
          ctx.globalAlpha = a * 0.28;
          ctx.translate(0, 598 * 2 + 4); ctx.scale(1, -1);
          ctx.drawImage(dash, 287, 110, 606, 359);
          ctx.restore();
          ctx.save();
          var rg = ctx.createLinearGradient(0, 598, 0, FH);
          rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,' + (0.85 * a).toFixed(3) + ')');
          ctx.fillStyle = rg; ctx.fillRect(280, 598, 620, FH - 598);
          ctx.restore();
        }
        ctx.restore();
      }
    };
  }

  function setup(section) {
    var seqBase = section.getAttribute('data-seq');
    var kind = section.getAttribute('data-seq-kind');
    var api = seqBase ? (kind === 'laptop' ? makeLaptopApi(seqBase) : makeSeqApi(seqBase)) : win[section.getAttribute('data-scene')];
    var canvas = section.querySelector('canvas');
    var chapters = Array.prototype.slice.call(section.querySelectorAll('[data-start]')).map(function (el) {
      return { el: el, start: parseFloat(el.getAttribute('data-start')), end: parseFloat(el.getAttribute('data-end')) };
    });
    var fill = section.querySelector('.intro-hud-track i');
    var ok = false;
    if (api && typeof api.init === 'function' && canvas) {
      try { ok = !!api.init(canvas, { mobile: win.innerWidth < 760, reduceMotion: reduce }); } catch (e) { ok = false; }
    }
    if (!ok) section.classList.add('no-webgl');

    function resize() {
      if (!ok || typeof api.resize !== 'function') return;
      var dpr = Math.min(win.devicePixelRatio || 1, win.innerWidth < 760 ? 1.5 : 2);
      try { api.resize(canvas.clientWidth || win.innerWidth, canvas.clientHeight || win.innerHeight, dpr); } catch (e) {}
    }
    resize();

    var smooth = 0, lastT = 0, active = -1, running = false, inView = false, raf = 0;
    function progress() {
      var r = section.getBoundingClientRect();
      var span = section.offsetHeight - win.innerHeight;
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    function update(t) {
      var p = progress();
      var dt = lastT ? Math.min(0.25, Math.max(0, (t - lastT) / 1000)) : 1;
      lastT = t;
      smooth = reduce ? p : smooth + (p - smooth) * (1 - Math.exp(-dt / 0.14));
      if (Math.abs(p - smooth) < 0.00005) smooth = p;
      var idx = 0;
      for (var i = 0; i < chapters.length; i++) { if (p >= chapters[i].start && p < chapters[i].end) { idx = i; break; } }
      if (p >= 1 && chapters.length) idx = chapters.length - 1;
      if (idx !== active) {
        chapters.forEach(function (c, k) { c.el.classList.toggle('is-active', k === idx); });
        active = idx;
      }
      section.style.setProperty('--ip', smooth.toFixed(4));
      if (fill) fill.style.width = (p * 100).toFixed(2) + '%';
      if (ok && api.ready !== false && typeof api.render === 'function') {
        try { api.render(smooth, t); } catch (e) {}
      }
    }
    function frame(t) {
      raf = 0;
      if (!running) return;
      update(t);
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      var want = inView && !doc.hidden;
      if (want && !running) { running = true; raf = requestAnimationFrame(frame); }
      else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    }
    if ('IntersectionObserver' in win) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        sync();
      }, { rootMargin: '10% 0px 10% 0px' }).observe(section);
    } else { inView = true; }
    doc.addEventListener('visibilitychange', sync);
    var rz = 0;
    win.addEventListener('resize', function () {
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(function () { resize(); if (!running) update(performance.now()); });
    });
    update(performance.now());
    sync();
  }

  /* Services side panel: company tabs */
  function initSideTabs() {
    var tabs = Array.prototype.slice.call(doc.querySelectorAll('.side-tab'));
    var panels = Array.prototype.slice.call(doc.querySelectorAll('.side-panel'));
    if (!tabs.length) return;
    function select(i, focus) {
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      panels.forEach(function (p, k) { p.hidden = k !== i; });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          select((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
        }
      });
    });
  }

  /* Contact form: composes an email to Ashutosh */
  function initForm() {
    var f = doc.getElementById('commForm');
    if (!f) return;
    var note = doc.getElementById('cfNote');
    var TO = 'ashutoshkumar04022004.ak@gmail.com';
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (doc.getElementById('cfName').value || '').trim();
      var email = (doc.getElementById('cfEmail').value || '').trim();
      var msg = (doc.getElementById('cfMsg').value || '').trim();
      if (!msg) { note.textContent = 'Add a short message first.'; doc.getElementById('cfMsg').focus(); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'That email address looks incomplete.'; doc.getElementById('cfEmail').focus(); return; }
      var subject = 'Opportunity for Ashutosh' + (name ? ' — from ' + name : '');
      var body = msg + (name || email ? '\n\n— ' + [name, email].filter(Boolean).join(' · ') : '');
      win.location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      note.textContent = 'If your email app did not open, write to ' + TO + '.';
    });
  }

  /* Top nav: highlight the section in view */
  function initNav() {
    var links = Array.prototype.slice.call(doc.querySelectorAll('.topnav a'));
    if (!links.length || !('IntersectionObserver' in win)) return;
    var map = {};
    links.forEach(function (a) { var id = a.getAttribute('href').slice(1); var el = doc.getElementById(id); if (el) map[id] = a; });
    var aliases = { story: 'top', why: 'about', dashboard: 'services', journey: 'experience', education: 'work', call: 'contact' };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id, target = map[id] ? id : aliases[id];
        if (!target || !map[target]) return;
        links.forEach(function (a) { a.classList.toggle('is-current', a === map[target]); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Array.prototype.forEach.call(doc.querySelectorAll('main > section[id]'), function (s) { io.observe(s); });
  }

  /* Theme toggle: the new theme spreads from the button like a symbiote (organic, tendrilled edge). */
  function initTheme() {
    var btn = doc.getElementById('themeBtn');
    if (!btn) return;
    var root = doc.documentElement, busy = false;
    function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
    function label() { btn.setAttribute('aria-label', current() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'); }
    function apply(theme) {
      if (theme === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
      try { win.localStorage.setItem('ak-theme', theme); } catch (e) {}
      label();
    }
    label();
    function venomFrames(x, y, W, H) {
      var far = Math.hypot(Math.max(x, W - x), Math.max(y, H - y));
      var N = 120, steps = 18, out = [], seed = 1 + Math.random() * 6;
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var R = 2 + far * 1.45 * e;
        var wob = 0.12 + (1 - t) * 0.95;
        var pts = [];
        for (var i = 0; i < N; i++) {
          var th = i / N * Math.PI * 2;
          var n = 0.20 * Math.sin(3 * th + seed + t * 2.4)
                + 0.13 * Math.sin(5 * th - seed * 1.3 + t * 3.6)
                + 0.08 * Math.sin(11 * th + seed * 2.2 - t * 5)
                + 0.55 * Math.pow(Math.max(0, Math.sin(6 * th + seed * 0.8 + t * 1.2)), 10)
                - 0.18 * Math.pow(Math.max(0, Math.sin(4 * th - seed + t * 2)), 6);
          var r = Math.max(0, R * (1 + n * wob));
          pts.push((x + r * Math.cos(th)).toFixed(1) + 'px ' + (y + r * Math.sin(th)).toFixed(1) + 'px');
        }
        out.push({ clipPath: 'polygon(' + pts.join(',') + ')' });
      }
      return out;
    }
    btn.addEventListener('click', function () {
      if (busy) return;
      var next = current() === 'light' ? 'dark' : 'light';
      if (reduce || !Element.prototype.animate) { apply(next); return; }
      var r = btn.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var frames = venomFrames(x, y, win.innerWidth, win.innerHeight);
      var opts = { duration: 1800, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' };
      busy = true;
      if (doc.startViewTransition) {
        var vt = doc.startViewTransition(function () { apply(next); });
        vt.ready.then(function () {
          root.animate(frames, Object.assign({ pseudoElement: '::view-transition-new(root)' }, opts));
        }).catch(function () {});
        vt.finished.then(function () { busy = false; }, function () { busy = false; });
      } else {
        var veil = doc.createElement('div');
        veil.className = 'venom-veil';
        veil.style.background = next === 'light' ? '#f4f4f2' : '#000';
        doc.body.appendChild(veil);
        veil.animate(frames, opts).onfinish = function () {
          apply(next);
          veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = function () {
            if (veil.parentNode) veil.parentNode.removeChild(veil);
            busy = false;
          };
        };
      }
    });
  }

  function boot() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-scene], [data-seq]'), setup);
    initSideTabs();
    initForm();
    initNav();
    initTheme();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
