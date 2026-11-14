/* main.js · Ashutosh Kumar portfolio v3
   Classic script (no modules, no build). Every feature is isolated so one
   failure never takes the rest of the page down, and content is never hidden
   if this file fails to run. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var win = window;

  /* ---------- Helpers ---------- */
  var mqReduce = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqFine = win.matchMedia ? win.matchMedia('(hover: hover) and (pointer: fine)') : null;
  var reduceMotion = !!(mqReduce && mqReduce.matches);

  function onMedia(mq, fn) {
    if (!mq) return;
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }
  onMedia(mqReduce, function (e) { reduceMotion = e.matches; });

  function canHover() { return !!(mqFine && mqFine.matches); }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function now() { return (win.performance && win.performance.now) ? win.performance.now() : Date.now(); }

  var nextFrame = win.requestAnimationFrame
    ? function (cb) { return win.requestAnimationFrame(cb); }
    : function (cb) { return setTimeout(function () { cb(now()); }, 16); };
  var cancelFrame = win.cancelAnimationFrame
    ? function (id) { if (id) win.cancelAnimationFrame(id); }
    : function (id) { if (id) clearTimeout(id); };

  function run(name, fn) {
    try { return fn(); } catch (err) {
      if (win.console && win.console.warn) win.console.warn('[main] ' + name + ' failed:', err);
    }
    return null;
  }

  root.classList.add('js');
  if (!reduceMotion) root.classList.add('is-loading');
  /* Whatever happens below, never keep the intro text held back. */
  setTimeout(function () { root.classList.remove('is-loading'); }, 3200);

  /* ---------- Split headings into masked words ---------- */
  /* Only real spaces split words, so "10&nbsp;days." stays together. */
  var SPACE_SPLIT = /([ \t\n\r]+)/;
  var SPACE_ONLY = /^[ \t\n\r]+$/;

  function splitWords(el) {
    if (!el || el.hasAttribute('data-split')) return;
    el.setAttribute('data-split', '');
    var idx = 0;

    function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      for (var k = 0; k < kids.length; k++) {
        var n = kids[k];
        if (n.nodeType === 3) {
          var parts = n.nodeValue.split(SPACE_SPLIT);
          var frag = doc.createDocumentFragment();
          for (var j = 0; j < parts.length; j++) {
            var t = parts[j];
            if (!t) continue;
            if (SPACE_ONLY.test(t)) { frag.appendChild(doc.createTextNode(' ')); continue; }
            var w = doc.createElement('span');
            w.className = 'w';
            var wi = doc.createElement('span');
            wi.className = 'wi';
            wi.textContent = t;
            wi.style.setProperty('--i', String(idx++));
            w.appendChild(wi);
            frag.appendChild(w);
          }
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      }
    }
    walk(el);
  }

  /* ---------- Loader ---------- */
  function initLoader() {
    var loader = $('#loader');
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      root.classList.remove('is-loading');
      if (!loader) return;
      loader.classList.add('is-done');
      var el = loader;
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }

    if (!loader) { finish(); return; }
    if (reduceMotion) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      loader = null;
      finish();
      return;
    }

    var nameEl = $('#loaderName');
    var fill = $('#loaderFill');
    var target = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';
    var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=/0123456789';
    var t0 = now();
    var scrambleMs = 900;
    var totalMs = 1050;
    var lastSwap = -100;

    function tick() {
      var t = now() - t0;
      if (nameEl && t - lastSwap > 42) {
        lastSwap = t;
        var k = clamp(t / scrambleMs, 0, 1);
        var out = '';
        for (var i = 0; i < target.length; i++) {
          var ch = target.charAt(i);
          var at = 0.15 + (i / Math.max(1, target.length - 1)) * 0.85;
          out += (ch === ' ' || k >= at) ? ch : glyphs.charAt((Math.random() * glyphs.length) | 0);
        }
        nameEl.textContent = out;
      }
      if (fill) fill.style.transform = 'scaleX(' + clamp(t / totalMs, 0, 1).toFixed(3) + ')';
      if (t < totalMs) nextFrame(tick);
      else {
        if (nameEl) nameEl.textContent = target;
        finish();
      }
    }
    nextFrame(tick);
    setTimeout(finish, 3000); /* fail-safe */
  }

  /* ---------- Top bar ---------- */
  function initTopbar(hero) {
    var bar = $('#topbar');
    if (!bar) return;
    var queued = false;
    function update() {
      queued = false;
      var edge = hero ? hero.getBoundingClientRect().bottom : 0;
      bar.classList.toggle('is-solid', edge <= bar.offsetHeight + 1);
    }
    function queue() { if (!queued) { queued = true; nextFrame(update); } }
    win.addEventListener('scroll', queue, { passive: true });
    win.addEventListener('resize', queue);
    update();
  }

  /* ---------- Menu ---------- */
  function initMenu() {
    var btn = $('#menuBtn');
    var menu = $('#menu');
    if (!btn || !menu) return;
    var links = $$('a', menu);
    var open = false;
    var hideTimer = 0;

    links.forEach(function (a, i) { a.style.setProperty('--i', String(i)); });

    function focusQuiet(el) {
      if (!el) return;
      try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
    }

    function setOpen(v, returnFocus) {
      if (v === open) return;
      open = v;
      clearTimeout(hideTimer);
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      root.classList.toggle('menu-open', v);
      if (v) {
        menu.hidden = false;
        void menu.offsetWidth; /* commit the hidden state so the fade runs */
        menu.classList.add('is-open');
        setTimeout(function () { if (open) focusQuiet(links[0]); }, 80);
      } else {
        menu.classList.remove('is-open');
        hideTimer = setTimeout(function () { if (!open) menu.hidden = true; }, reduceMotion ? 0 : 520);
        if (returnFocus) focusQuiet(btn);
      }
    }

    btn.addEventListener('click', function () { setOpen(!open, false); });
    links.forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false, false); });
    });

    doc.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        setOpen(false, true);
        return;
      }
      if (e.key !== 'Tab') return;
      /* keep focus inside the menu while it is open */
      var f = [btn].concat(links);
      var i = f.indexOf(doc.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
    });
  }

  /* ---------- Hero: scroll progress, chapters, HUD, scene ---------- */
  function initHero() {
    var hero = $('.hero');
    if (!hero) return null;
    var canvas = $('#scene');

    var chapters = $$('.chapter', hero).map(function (el) {
      var s = parseFloat(el.getAttribute('data-start'));
      var e = parseFloat(el.getAttribute('data-end'));
      return {
        el: el,
        start: isNaN(s) ? 0 : s,
        end: isNaN(e) ? 1 : e,
        stage: el.getAttribute('data-stage') || ''
      };
    });
    if (!chapters.length) return hero;

    var hudIndex = $('#hudIndex');
    var hudName = $('#hudName');
    var hudFill = $('#hudFill');
    var hudYear = $('#hudYear');
    var cue = $('#scrollCue');
    var statsCh = $('.chapter-stats', hero);
    var counters = $$('[data-count]', hero);
    $$('.stats > div', hero).forEach(function (d, i) { d.style.setProperty('--i', String(i)); });

    /* WebGL scene (optional) */
    var scene = win.HeroScene;
    var sceneOk = false;
    if (scene && typeof scene.init === 'function' && canvas) {
      try {
        var res = scene.init(canvas, { mobile: win.innerWidth < 760, reduceMotion: reduceMotion });
        sceneOk = !!res || (res === undefined && !!scene.ready);
      } catch (err) {
        sceneOk = false;
      }
    }
    if (!sceneOk) hero.classList.add('no-webgl');

    function resizeScene() {
      if (!sceneOk || typeof scene.resize !== 'function') return;
      var w = canvas.clientWidth || win.innerWidth;
      var h = canvas.clientHeight || win.innerHeight;
      var dpr = Math.min(win.devicePixelRatio || 1, win.innerWidth < 760 ? 1.5 : 2);
      try { scene.resize(w, h, dpr); } catch (err) { /* never break the page */ }
    }
    resizeScene();

    function yearAt(p) {
      if (p <= 0) return 2021;
      if (p < 0.37) return 2021 + 4 * (p / 0.37);
      if (p < 0.59) return 2025 + (p - 0.37) / 0.22;
      return 2026;
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    var active = -1;
    var smooth = 0;
    var running = false;
    var frameId = 0;
    var inView = true;
    var lastYear = '';
    var lastFill = '';
    var lastLp = -1;
    var countId = 0;

    function progress() {
      var rect = hero.getBoundingClientRect();
      var span = hero.offsetHeight - win.innerHeight;
      return span > 0 ? clamp(-rect.top / span, 0, 1) : 0;
    }

    function chapterAt(p) {
      for (var i = 0; i < chapters.length; i++) {
        if (p >= chapters[i].start && p < chapters[i].end) return i;
      }
      return p <= chapters[0].start ? 0 : chapters.length - 1;
    }

    function runCounters() {
      cancelFrame(countId);
      countId = 0;
      if (reduceMotion) {
        counters.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
        return;
      }
      var t0 = now();
      var dur = 1400;
      var delay = 320;
      counters.forEach(function (el) { el.textContent = '0'; });
      function step() {
        var k = clamp((now() - t0 - delay) / dur, 0, 1);
        var e = 1 - Math.pow(1 - k, 4);
        counters.forEach(function (el) {
          var to = parseFloat(el.getAttribute('data-count')) || 0;
          el.textContent = String(Math.round(to * e));
        });
        countId = k < 1 ? nextFrame(step) : 0;
      }
      countId = nextFrame(step);
    }

    function setActive(i) {
      if (i === active) return;
      active = i;
      lastLp = -1;
      for (var k = 0; k < chapters.length; k++) {
        chapters[k].el.classList.toggle('is-active', k === i);
        chapters[k].el.classList.toggle('is-past', k < i);
      }
      if (hudIndex) hudIndex.textContent = pad2(i + 1);
      if (hudName) hudName.textContent = chapters[i].stage;
      if (statsCh && chapters[i].el === statsCh) runCounters();
      else { cancelFrame(countId); countId = 0; }
    }

    var lastT = 0;
    function update(t) {
      var p = progress();
      // time-based easing: same feel at 30, 60 or 120 fps, and never stuck when frames are throttled
      var dt = lastT ? Math.min(0.25, Math.max(0, (t - lastT) / 1000)) : 1;
      lastT = t;
      var k = 1 - Math.exp(-dt / 0.14);
      smooth = reduceMotion ? p : smooth + (p - smooth) * k;
      if (Math.abs(p - smooth) < 0.00005) smooth = p;

      setActive(chapterAt(p));

      var c = chapters[active];
      var end = Math.min(c.end, 1);
      var lp = end > c.start ? clamp((p - c.start) / (end - c.start), 0, 1) : 0;
      if (Math.abs(lp - lastLp) > 0.002) {
        lastLp = lp;
        c.el.style.setProperty('--lp', lp.toFixed(3));
      }

      var fill = (p * 100).toFixed(2) + '%';
      if (hudFill && fill !== lastFill) { hudFill.style.width = fill; lastFill = fill; }

      var y = String(Math.floor(yearAt(p) + 1e-6));
      if (hudYear && y !== lastYear) { hudYear.textContent = y; lastYear = y; }

      if (cue) cue.classList.toggle('is-hidden', p > 0.015);

      if (sceneOk && scene.ready && typeof scene.render === 'function') {
        try { scene.render(smooth, t); } catch (err) { /* contract: never throws */ }
      }
    }

    function frame(t) {
      frameId = 0;
      if (!running) return;
      update(typeof t === 'number' ? t : now());
      frameId = nextFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      if (sceneOk && typeof scene.setActive === 'function') { try { scene.setActive(true); } catch (err) {} }
      if (!frameId) frameId = nextFrame(frame);
    }
    function stop() {
      if (!running) return;
      running = false;
      cancelFrame(frameId);
      frameId = 0;
      if (sceneOk && typeof scene.setActive === 'function') { try { scene.setActive(false); } catch (err) {} }
    }
    function sync() {
      if (inView && !doc.hidden) start();
      else stop();
    }

    if ('IntersectionObserver' in win) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        sync();
      }).observe(hero);
    }
    doc.addEventListener('visibilitychange', sync);

    var rz = 0;
    win.addEventListener('resize', function () {
      cancelFrame(rz);
      rz = nextFrame(function () {
        rz = 0;
        resizeScene();
        if (!running) update(now());
      });
    });

    update(now());
    sync();
    return hero;
  }

  /* ---------- Reveal on scroll (visible by default) ---------- */
  function initReveal() {
    var els = $$('.reveal');
    if (!els.length || reduceMotion || !('IntersectionObserver' in win)) return;
    var vh = win.innerHeight || root.clientHeight;
    var pending = els.filter(function (el) { return el.getBoundingClientRect().top > vh * 0.95; });
    if (!pending.length) return;
    pending.forEach(function (el) { el.classList.add('is-pending'); });

    var io;
    function show(el, i) {
      if (io) io.unobserve(el);
      el.style.setProperty('--rd', (Math.min(i, 6) * 90) + 'ms');
      el.classList.remove('is-pending');
      el.classList.add('is-in');
      setTimeout(function () {
        el.classList.remove('is-in');
        el.style.removeProperty('--rd');
      }, 1900 + i * 90);
    }

    io = new IntersectionObserver(function (entries) {
      var batch = [];
      entries.forEach(function (e) { if (e.isIntersecting) batch.push(e.target); });
      batch.sort(function (a, b) {
        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        return (Math.round(ra.top / 12) - Math.round(rb.top / 12)) || (ra.left - rb.left);
      });
      batch.forEach(show);
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    pending.forEach(function (el) { io.observe(el); });

    /* Safety net: at the very bottom of the page, show anything still waiting. */
    function atBottom() {
      var y = win.pageYOffset || root.scrollTop || 0;
      if (win.innerHeight + y >= root.scrollHeight - 4) {
        $$('.reveal.is-pending').forEach(show);
      }
    }
    win.addEventListener('scroll', atBottom, { passive: true });
  }

  /* ---------- 3D pointer tilt (photo ±8°, cards ±5°) ---------- */
  function initTilt() {
    $$('[data-tilt]').forEach(function (el) {
      var max = el.classList.contains('tilt') ? 8 : 5;
      var id = 0;
      var rx = 0, ry = 0, mx = 50, my = 50;

      function apply() {
        id = 0;
        el.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
        el.style.setProperty('--mx', mx.toFixed(1) + '%');
        el.style.setProperty('--my', my.toFixed(1) + '%');
      }
      function allowed(e) { return e.pointerType !== 'touch' && canHover() && !reduceMotion; }

      el.addEventListener('pointermove', function (e) {
        if (!allowed(e)) return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = clamp((e.clientX - r.left) / r.width, 0, 1);
        var y = clamp((e.clientY - r.top) / r.height, 0, 1);
        ry = (x - 0.5) * 2 * max;
        rx = (0.5 - y) * 2 * max;
        mx = x * 100;
        my = y * 100;
        if (!el.classList.contains('is-tilting')) el.classList.add('is-tilting');
        if (!id) id = nextFrame(apply);
      });
      el.addEventListener('pointerleave', function () {
        cancelFrame(id);
        id = 0;
        el.classList.remove('is-tilting');
        el.style.transform = '';
      });
    });
  }

  /* ---------- Spotlight that follows the pointer on cards ---------- */
  function initSpot() {
    $$('.glance-grid > div, .flip, .edu-stats > div, .edu-certs, .email-box, .tabs').forEach(function (el) {
      var id = 0, x = 0, y = 0;
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = el.getBoundingClientRect();
        x = e.clientX - r.left;
        y = e.clientY - r.top;
        if (!id) {
          id = nextFrame(function () {
            id = 0;
            el.style.setProperty('--mx', Math.round(x) + 'px');
            el.style.setProperty('--my', Math.round(y) + 'px');
          });
        }
      });
    });
  }

  /* ---------- Journey: swipeable 3D ring carousel ---------- */
  function initRing() {
    var stage = $('#ringStage');
    var ring = $('#ring');
    if (!stage || !ring) return;
    var cards = $$('.ring-card', ring);
    var n = cards.length;
    if (!n) return;

    var step = 360 / n;
    var prevBtn = $('#ringPrev');
    var nextBtn = $('#ringNext');
    var dotsWrap = $('#ringDots');
    var LIFT = 40;
    var pos = 0;       /* continuous position, in cards (can go past n) */
    var target = 0;
    var radius = 0;
    var cardW = 340;
    var front = -1;
    var tweenId = 0;

    stage.setAttribute('tabindex', '0');
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Career milestones. Use the left and right arrow keys to move between them.');

    var live = doc.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    if (stage.parentNode) stage.parentNode.insertBefore(live, stage.nextSibling);

    function titleOf(i) {
      var t = cards[i].querySelector('.rc-title');
      return t ? t.textContent.replace(/\s+/g, ' ').trim() : 'Milestone ' + (i + 1);
    }

    cards.forEach(function (c, i) {
      if (!c.id) c.id = 'ring-card-' + (i + 1);
      c.setAttribute('aria-roledescription', 'slide');
      c.setAttribute('aria-label', (i + 1) + ' of ' + n + ': ' + titleOf(i));
    });

    /* Dots (role=tab) */
    var dots = [];
    if (dotsWrap) {
      while (dotsWrap.firstChild) dotsWrap.removeChild(dotsWrap.firstChild);
      cards.forEach(function (c, i) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ring-dot';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', titleOf(i));
        b.setAttribute('aria-controls', c.id);
        b.setAttribute('aria-selected', 'false');
        b.tabIndex = -1;
        b.addEventListener('click', function () { goTo(nearest(i), true); });
        dotsWrap.appendChild(b);
        dots.push(b);
      });
      dotsWrap.addEventListener('keydown', function (e) {
        var i = dots.indexOf(doc.activeElement);
        if (i < 0) return;
        var k = e.key;
        var j = -1;
        if (k === 'ArrowRight' || k === 'Right') j = (i + 1) % n;
        else if (k === 'ArrowLeft' || k === 'Left') j = (i - 1 + n) % n;
        else if (k === 'Home') j = 0;
        else if (k === 'End') j = n - 1;
        if (j < 0) return;
        e.preventDefault();
        dots[j].focus();
        goTo(nearest(j), true);
      });
    }

    function base() { return tweenId ? target : Math.round(pos); }

    function nearest(i) {
      var b = base();
      var d = mod(i - b, n);
      if (d > n / 2) d -= n;
      return b + d;
    }

    function cardTransform(i) {
      return 'rotateY(' + (i * step) + 'deg) translateZ(' + (radius + (i === front ? LIFT : 0)) + 'px)';
    }

    function setFront(f) {
      if (f === front) return;
      front = f;
      for (var i = 0; i < n; i++) {
        var on = i === f;
        cards[i].classList.toggle('is-front', on);
        cards[i].setAttribute('aria-hidden', on ? 'false' : 'true');
        cards[i].style.transform = cardTransform(i);
        if (dots[i]) {
          dots[i].setAttribute('aria-selected', on ? 'true' : 'false');
          dots[i].tabIndex = on ? 0 : -1;
        }
      }
    }

    function render() {
      ring.style.transform = 'translateZ(' + (-radius) + 'px) rotateY(' + (-pos * step).toFixed(3) + 'deg)';
      setFront(mod(Math.round(pos), n));
    }

    function layout() {
      cardW = ring.offsetWidth || 340;
      /* r = card width / (2·tan(π/n)) + gap */
      radius = Math.round(cardW / (2 * Math.tan(Math.PI / n)) + cardW * 0.14);
      for (var i = 0; i < n; i++) cards[i].style.transform = cardTransform(i);
      render();
    }

    function announce() {
      if (front < 0) return;
      live.textContent = 'Milestone ' + (front + 1) + ' of ' + n + ': ' + titleOf(front);
    }

    function easeOutBack(k) {
      var c1 = 1.2, c3 = c1 + 1;
      return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    }

    function stopTween() {
      cancelFrame(tweenId);
      tweenId = 0;
    }

    function goTo(t, speak) {
      stopTween();
      target = t;
      var from = pos;
      var dist = t - from;
      if (reduceMotion || Math.abs(dist) < 0.0005) {
        pos = t;
        render();
        if (speak) announce();
        return;
      }
      var t0 = now();
      var dur = clamp(560 + Math.abs(dist) * 160, 560, 1200);
      function tick() {
        var k = clamp((now() - t0) / dur, 0, 1);
        pos = from + dist * easeOutBack(k);
        render();
        if (k < 1) tweenId = nextFrame(tick);
        else {
          tweenId = 0;
          pos = t;
          render();
          if (speak) announce();
        }
      }
      tweenId = nextFrame(tick);
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(base() - 1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(base() + 1, true); });

    stage.addEventListener('keydown', function (e) {
      if (e.target !== stage) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'Left') { e.preventDefault(); goTo(base() - 1, true); }
      else if (k === 'ArrowRight' || k === 'Right') { e.preventDefault(); goTo(base() + 1, true); }
      else if (k === 'Home') { e.preventDefault(); goTo(nearest(0), true); }
      else if (k === 'End') { e.preventDefault(); goTo(nearest(n - 1), true); }
    });

    /* Pointer drag / touch swipe (touch-action: pan-y keeps vertical page scroll) */
    var dragging = false;
    var moved = false;
    var pid = null;
    var startX = 0, startPos = 0, lastX = 0, lastT = 0, vel = 0;

    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopTween();
      dragging = true;
      moved = false;
      pid = e.pointerId;
      startX = lastX = e.clientX;
      startPos = pos;
      lastT = now();
      vel = 0;
    });

    stage.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pid) return;
      var dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < 6) return;
        moved = true;
        stage.classList.add('is-dragging');
        try { stage.setPointerCapture(pid); } catch (err) {}
      }
      var t = now();
      var dt = t - lastT;
      if (dt > 0) vel = vel * 0.5 + ((e.clientX - lastX) / dt) * 0.5;
      lastX = e.clientX;
      lastT = t;
      pos = startPos - dx / (cardW * 1.1);
      render();
    });

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pid)) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      try {
        if (stage.hasPointerCapture && stage.hasPointerCapture(pid)) stage.releasePointerCapture(pid);
      } catch (err) {}
      if (!moved) {
        if (Math.abs(pos - Math.round(pos)) > 0.001) goTo(Math.round(pos), false);
        return;
      }
      var flick = (e && e.type !== 'pointercancel' && now() - lastT < 120) ? vel : 0;
      var t;
      if (Math.abs(flick) > 0.35) t = flick < 0 ? Math.floor(pos) + 1 : Math.ceil(pos) - 1;
      else t = Math.round(pos);
      goTo(t, true);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('lostpointercapture', function (e) { if (dragging) endDrag(e); });
    stage.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* Click a side card to bring it to the front */
    ring.addEventListener('click', function (e) {
      if (moved) return;
      var el = e.target;
      while (el && el !== ring && !(el.classList && el.classList.contains('ring-card'))) el = el.parentNode;
      if (!el || el === ring) return;
      var i = cards.indexOf(el);
      if (i > -1 && i !== front) goTo(nearest(i), true);
    });

    var rz = 0;
    win.addEventListener('resize', function () {
      cancelFrame(rz);
      rz = nextFrame(function () { rz = 0; layout(); });
    });
    layout();
  }

  /* ---------- BA × BD flip cards ---------- */
  function initFlip() {
    $$('.flip').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = !b.classList.contains('is-flipped');
        b.classList.toggle('is-flipped', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  }

  /* ---------- Experience tabs with sliding indicator ---------- */
  function initTabs() {
    var list = $('.tab-list');
    if (!list) return;
    var tabs = $$('[role="tab"]', list);
    if (!tabs.length) return;

    var ind = doc.createElement('span');
    ind.className = 'tab-ind';
    ind.setAttribute('aria-hidden', 'true');
    list.appendChild(ind);
    var current = null;

    function panelOf(t) {
      var id = t.getAttribute('aria-controls');
      return id ? doc.getElementById(id) : null;
    }

    function moveInd(instant) {
      if (!current) return;
      if (instant) ind.style.transition = 'none';
      ind.style.width = current.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + current.offsetLeft + 'px)';
      if (instant) {
        void ind.offsetWidth;
        ind.style.transition = '';
      }
    }

    function select(t, focus, instant) {
      current = t;
      tabs.forEach(function (x) {
        var on = x === t;
        var p = panelOf(x);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        if (p) p.hidden = !on;
      });
      var panel = panelOf(t);
      if (panel) {
        $$('.role-points li', panel).forEach(function (li, i) { li.style.setProperty('--i', String(i)); });
      }
      if (focus) t.focus();
      moveInd(instant);
    }

    tabs.forEach(function (t) {
      var p = panelOf(t);
      if (p) p.tabIndex = 0;
      t.addEventListener('click', function () { if (t !== current) select(t, false, false); });
    });

    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(doc.activeElement);
      if (i < 0) return;
      var k = e.key;
      var j = -1;
      if (k === 'ArrowRight' || k === 'Right') j = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft' || k === 'Left') j = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') j = 0;
      else if (k === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      select(tabs[j], true, false);
    });

    var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    select(initial, false, true);

    var rz = 0;
    win.addEventListener('resize', function () {
      cancelFrame(rz);
      rz = nextFrame(function () { rz = 0; moveInd(true); });
    });
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
      doc.fonts.ready.then(function () { moveInd(true); });
    }
  }

  /* ---------- Contact: copy email ---------- */
  function initCopy() {
    var btn = $('#copyEmail');
    var addr = $('#emailAddr');
    if (!btn || !addr) return;
    var label = btn.textContent;
    var timer = 0;
    btn.setAttribute('aria-live', 'polite');

    function flash(text) {
      btn.textContent = text;
      btn.classList.add('is-copied');
      clearTimeout(timer);
      timer = setTimeout(function () {
        btn.textContent = label;
        btn.classList.remove('is-copied');
      }, 1800);
    }

    function selectAddr() {
      try {
        var range = doc.createRange();
        range.selectNodeContents(addr);
        var sel = win.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {}
      flash('Selected');
    }

    btn.addEventListener('click', function () {
      var email = (addr.textContent || '').trim();
      var clip = navigator.clipboard;
      if (clip && typeof clip.writeText === 'function') {
        var p;
        try { p = clip.writeText(email); } catch (err) { selectAddr(); return; }
        if (p && typeof p.then === 'function') p.then(function () { flash('Copied'); }, selectAddr);
        else flash('Copied');
      } else {
        selectAddr();
      }
    });
  }

  /* ---------- Echo words drift sideways with scroll ---------- */
  function initEcho() {
    var items = $$('[data-echo]').map(function (el) { return { el: el, vis: false }; });
    if (!items.length) return;
    var id = 0;

    function update() {
      id = 0;
      if (reduceMotion) return;
      var vh = win.innerHeight || 800;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.vis) continue;
        var r = it.el.getBoundingClientRect();
        var t = (r.top + r.height / 2) / vh;
        it.el.style.setProperty('--ex', ((t - 0.5) * vh * 0.28).toFixed(1) + 'px');
      }
    }
    function queue() { if (!id) id = nextFrame(update); }

    if ('IntersectionObserver' in win) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].el === e.target) items[i].vis = e.isIntersecting;
          }
        });
        queue();
      }, { rootMargin: '25% 0px 25% 0px' });
      items.forEach(function (it) { io.observe(it.el); });
    } else {
      items.forEach(function (it) { it.vis = true; });
    }
    win.addEventListener('scroll', queue, { passive: true });
    win.addEventListener('resize', queue);
    queue();
  }

  /* ---------- Boot ---------- */
  run('split', function () {
    $$('.chapter .display, .chapter .statement, .h2, .display-lg').forEach(splitWords);
  });
  run('loader', initLoader);
  var hero = run('hero', initHero);
  run('topbar', function () { initTopbar(hero); });
  run('menu', initMenu);
  run('reveal', initReveal);
  run('tilt', initTilt);
  run('spot', initSpot);
  run('ring', initRing);
  run('flip', initFlip);
  run('tabs', initTabs);
  run('copy', initCopy);
  run('echo', initEcho);
})();
