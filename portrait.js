/* portrait.js - PortraitScene: 2.5D displaced photo-portrait for the hero.
   window.PortraitScene = { ready, loaded, failed,
     init(canvas, {mobile, reduceMotion}) -> bool, render(p0to1, timeMs), resize(cssW, cssH, dpr) }
   Three.js r128 as the global THREE (classic script, no modules).
   A dense plane carries the cut-out photo; its vertices are pushed forward by an analytic
   head / nose / eye-socket / torso depth field, then lit in the fragment shader with a soft key
   plus a red-magenta rim on the left and an electric-blue rim on the right.
   Optional override: assets/face/manifest.json {count, ext} -> assets/face/f_0001.<ext> ...
   drawn cover-fit on a 2D canvas laid over the WebGL canvas.
   Events: window 'portrait:loaded' / 'portrait:error' when the photo texture resolves. */
(function () {
  'use strict';

  var PS = { ready: false, loaded: false, failed: false };
  window.PortraitScene = PS;

  var T = window.THREE;
  if (!T) {
    PS.init = function () { return false; };
    PS.render = PS.resize = function () {};
    return;
  }

  var IMG_SRC = 'assets/face-cut.webp', SEQ_DIR = 'assets/face/';
  var PW = 1.0, PH = 800 / 760;                         // plane size (image aspect 760:800)
  var HX = (0.49 - 0.5) * PW, HY = (0.617 - 0.5) * PH;  // head centre in plane space = pivot
  var FOV = 30, TAN = Math.tan(FOV * Math.PI / 360);

  var renderer = null, scene = null, camera = null, group = null, mat = null;
  var canvasEl = null, W = 1, H = 1, DPR = 1;
  var isMobile = false, reduce = false, noPointer = false;
  var loadedAt = 0, lastT = -1;
  var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  var seq = null;                                        // frame-sequence state (optional)

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function emit(name) {
    try { window.dispatchEvent(new CustomEvent(name)); } catch (e) { /* very old browsers */ }
  }

  /* ------------------------------------------------------------------ shaders */
  // Depth landmarks were measured on face-cut.webp (uv, v = 1 at the top): the hair/head mass
  // is centred at u 0.49 but the face itself sits a little left of that, so nose/eyes follow
  // the photo. Normals come from finite differences of the same field (smooth, no facets).
  var VERT = [
    'uniform float uDepth;',
    'uniform vec2 uSize;',
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'float g2(vec2 p, vec2 c, vec2 s) { vec2 d = (p - c) / s; return exp(-0.5 * dot(d, d)); }',
    'float depthAt(vec2 q) {',
    '  vec2 d = (q - vec2(0.49, 0.617)) / vec2(0.275, 0.33);',
    // Rounded head with a finite edge slope (sqrt has a vertical cliff, which at ~35 deg of turn
    // replaces the hair outline with a smooth egg-shaped horizon and smears the edge texels).
    '  float h2 = max(0.0, 1.0 - dot(d, d));',
    '  float head = h2 * (1.0 + 0.35 * h2) / 1.35;',
    '  float inHead = smoothstep(0.0, 0.35, head);',
    '  float face = 0.07 * g2(q, vec2(0.47, 0.47), vec2(0.13, 0.14));',
    '  float nose = 0.16 * g2(q, vec2(0.462, 0.5), vec2(0.042, 0.055));',   // gentler flanks: no smear at 35 deg
    '  float eyes = -0.06 * (g2(q, vec2(0.375, 0.572), vec2(0.04)) + g2(q, vec2(0.56, 0.572), vec2(0.04)));',
    '  vec2 t = (q - vec2(0.5, -0.06)) / vec2(0.6, 0.42);',
    '  float torso = 0.35 * sqrt(max(0.0, 1.0 - dot(t, t))) * (1.0 - smoothstep(0.22, 0.36, q.y));',
    '  return max(head * 0.6 + (face + nose + eyes) * inHead, torso);',
    '}',
    'void main() {',
    '  vUv = uv;',
    '  float e = 0.0025;',
    '  float d = depthAt(uv);',
    '  float du = (depthAt(uv + vec2(e, 0.0)) - depthAt(uv - vec2(e, 0.0))) / (2.0 * e) * uDepth;',
    '  float dv = (depthAt(uv + vec2(0.0, e)) - depthAt(uv - vec2(0.0, e))) / (2.0 * e) * uDepth;',
    '  vN = normalize(normalMatrix * vec3(-du * uSize.y, -dv * uSize.x, uSize.x * uSize.y));',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, d * uDepth, 1.0);',
    '}'
  ].join('\n');

  // The cut-out has see-through holes where the original hair had bright highlights; inside the
  // upper head ellipse those are filled with a dark hair tone instead of being discarded.
  // fwidth() anti-aliases the alpha cut edge; the bottom/sides dissolve so no hard photo border.
  var FRAG = [
    'uniform sampler2D uMap;',
    'uniform float uRim;',
    'uniform float uExposure;',
    'uniform float uFade;',
    'uniform float uGrain;',
    'uniform vec3 uRimA;',
    'uniform vec3 uRimB;',
    'uniform vec3 uKey;',
    'varying vec2 vUv;',
    'varying vec3 vN;',
    'float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }',
    'float fillAt(vec2 q) {',
    '  vec2 hd = (q - vec2(0.49, 0.617)) / vec2(0.275, 0.33);',
    '  return (1.0 - smoothstep(0.84, 0.95, length(hd))) * smoothstep(0.6, 0.68, q.y);',
    '}',
    'float alphaAt(vec2 q) { return max(texture2D(uMap, q).a, fillAt(q)); }',
    'void main() {',
    '  vec4 tx = texture2D(uMap, vUv);',
    '  float fill = fillAt(vUv);',
    '  float al = max(tx.a, fill);',
    '  float aw = max(fwidth(al) * 1.5, 0.0001);',   // derivatives / extra taps before discard
    // silhouette edges from the cut-out alpha: transparent to the left => left edge, etc.
    '  float eL = 1.0 - 0.5 * (alphaAt(vUv - vec2(0.006, 0.0)) + alphaAt(vUv - vec2(0.015, 0.0)));',
    '  float eR = 1.0 - 0.5 * (alphaAt(vUv + vec2(0.006, 0.0)) + alphaAt(vUv + vec2(0.015, 0.0)));',
    '  if (al < 0.35) discard;',
    '  vec3 col = mix(vec3(0.085, 0.085, 0.1), tx.rgb, clamp(tx.a + 1.0 - fill, 0.0, 1.0));',
    // grade: desaturate ~35%, contrast + soft S-curve, lifted cool blacks
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(col, vec3(lum), 0.35);',
    '  col = clamp((col - 0.5) * 1.15 + 0.5, 0.0, 1.0);',
    '  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);',
    '  col = col * 0.93 + vec3(0.02, 0.022, 0.03);',
    // soft key from front-top(-left) + contact shadow under the chin
    '  vec3 n = normalize(vN);',
    '  col *= 0.5 + 0.6 * max(dot(n, uKey), 0.0);',
    '  vec2 ch = (vUv - vec2(0.47, 0.24)) / vec2(0.085, 0.045);',
    '  col *= 1.0 - 0.45 * exp(-0.5 * dot(ch, ch));',
    // rims: red-magenta on left-facing surfaces, blue on right-facing, strongest side-on.
    // Any fold that turns past grazing (DoubleSide) keeps its outward normal => full rim.
    '  float side = pow(clamp(1.0 - n.z, 0.0, 1.0), 2.0);',
    '  float lw = 1.0 - smoothstep(-0.65, 0.05, n.x);',
    '  float rw = smoothstep(-0.05, 0.65, n.x);',
    '  vec3 rim = uRimA * lw + uRimB * rw;',
    '  col += rim * uRim * (side * 2.0 + 0.08) * (0.5 + 0.5 * lum);',
    '  col += (uRimA * eL * 0.7 + uRimB * eR * 0.95) * uRim;',   // thin rim along the photo outline
    '  col *= uExposure;',
    // 24 fps film grain
    '  col += (ign(gl_FragCoord.xy + uGrain * vec2(13.0, 7.0)) - 0.5) * 0.05;',
    '  float cut = clamp((al - 0.35) / aw, 0.0, 1.0);',
    '  float a = cut * uFade * smoothstep(0.0, 0.16, vUv.y);',
    '  a *= smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));',
    '  a *= mix(1.0, uExposure, 0.5);',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);',
    '}'
  ].join('\n');

  /* ------------------------------------------------- frame-sequence override */
  function initSequence() {
    if (!window.fetch) return;
    try {
      fetch(SEQ_DIR + 'manifest.json', { cache: 'no-cache' })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (m) {
          var n = m ? Math.floor(+m.count) : 0;
          if (!(n >= 1 && n <= 1500)) return;
          var ext = (typeof m.ext === 'string' && /^[a-z0-9]{2,5}$/i.test(m.ext)) ? m.ext : 'webp';
          startSequence(n, ext);
        })
        .catch(function () { /* no sequence: keep the 2.5D mesh */ });
    } catch (e) { /* ignore */ }
  }

  function startSequence(n, ext) {
    var parent = canvasEl && canvasEl.parentNode;
    if (!parent || seq) return;
    var c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.className = 'portrait-seq';
    var s = c.style, z = '';
    s.position = 'absolute';
    s.pointerEvents = 'none';
    s.display = 'none';
    try { z = window.getComputedStyle(canvasEl).zIndex; } catch (e) { z = ''; }
    if (z && z !== 'auto') s.zIndex = z;
    parent.insertBefore(c, canvasEl.nextSibling);
    seq = { n: n, imgs: [], ok: [], count: 0, canvas: c, ctx: c.getContext('2d'), key: '' };
    for (var i = 0; i < n; i++) loadFrame(i, ext);
    placeSeq();
  }

  function loadFrame(i, ext) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () { seq.ok[i] = true; seq.count++; };
    img.src = SEQ_DIR + 'f_' + ('000' + (i + 1)).slice(-4) + '.' + ext;
    seq.imgs[i] = img;
  }

  function placeSeq() {
    if (!seq || !canvasEl) return;
    var s = seq.canvas.style;
    s.left = canvasEl.offsetLeft + 'px';
    s.top = canvasEl.offsetTop + 'px';
    s.width = W + 'px';
    s.height = H + 'px';
    var pw = Math.max(1, Math.round(W * DPR)), ph = Math.max(1, Math.round(H * DPR));
    if (seq.canvas.width !== pw) seq.canvas.width = pw;
    if (seq.canvas.height !== ph) seq.canvas.height = ph;
    seq.key = '';
  }

  // Draws frame round(p*(N-1)), or the nearest frame that has loaded. Returns false if none has.
  function drawSequence(p, exposure) {
    if (!seq || !seq.count || !seq.ctx) return false;
    var n = seq.n, idx = Math.round(p * (n - 1)), best = -1;
    for (var d = 0; d < n && best < 0; d++) {
      if (idx - d >= 0 && seq.ok[idx - d]) best = idx - d;
      else if (idx + d < n && seq.ok[idx + d]) best = idx + d;
    }
    if (best < 0) return false;
    var c = seq.canvas, ctx = seq.ctx;
    if (c.style.display !== 'block') c.style.display = 'block';
    var key = best + '|' + exposure.toFixed(2) + '|' + c.width + 'x' + c.height;
    if (key === seq.key) return true;
    seq.key = key;
    var img = seq.imgs[best], iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    var wide = (c.width / c.height) >= 0.9 && !isMobile;
    var sc, dx, dy;
    if (wide) {
      // fill the height, keep the whole head, sit the face right of centre (text lives on the left)
      // reel proportions: head about 78% of the viewport height, sitting on the bottom edge, right of centre
      sc = Math.min(c.height / ih * 0.9, c.width / iw * 0.82);
      var dw0 = iw * sc, dh0 = ih * sc;
      dx = (c.width - dw0) / 2 + c.width * 0.07;
      dy = c.height - dh0;
    } else {
      // phone: frame the head in the upper part of the screen, text sits below
      sc = c.width / iw * 2.3;
      dx = (c.width - iw * sc) / 2;
      dy = c.height * 0.06;
    }
    var dw = iw * sc, dh = ih * sc;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = exposure;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
    if (wide) {
      // feather the image edges into the page background so no seam shows
      var fw = dw * 0.14, g;
      g = ctx.createLinearGradient(dx, 0, dx + fw, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(dx - 2, 0, fw + 2, c.height);
      g = ctx.createLinearGradient(dx + dw, 0, dx + dw - fw, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(dx + dw - fw, 0, fw + 2, c.height);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      if (dx > 0) ctx.fillRect(0, 0, Math.ceil(dx), c.height);
      if (dx + dw < c.width) ctx.fillRect(Math.floor(dx + dw), 0, c.width - Math.floor(dx + dw), c.height);
    }
    return true;
  }

  /* ------------------------------------------------------- pointer + framing */
  function onMove(e) {
    ptr.tx = clamp(e.clientX / (window.innerWidth || 1) * 2 - 1, -1, 1);
    ptr.ty = clamp(e.clientY / (window.innerHeight || 1) * 2 - 1, -1, 1);
  }

  // Camera looks straight down -z; the head centre sits at the world origin (the pivot).
  function frame(e) {
    var aspect = W / H, centred = isMobile || aspect < 0.9;
    var z = lerp(2.6, 2.0, e);
    if (centred) z *= Math.max(1, 0.8 / (2 * TAN * aspect * 2.3)); // keep the head inside narrow screens
    var visH = 2 * z * TAN, visW = visH * aspect, cx = 0, cy;
    if (centred) {
      cy = -0.14 * visH;                                           // head centre ~36% from the top
    } else {
      cx = -Math.max(0, Math.min(visW * 0.15, visW * 0.5 - 0.45)); // face slightly right of centre
      cy = -0.03 * visH;
    }
    camera.position.set(cx, cy, z);
  }

  /* --------------------------------------------------------------------- API */
  PS.init = function (canvas, opts) {
    try {
      if (PS.ready) return true;
      opts = opts || {};
      canvasEl = canvas;
      isMobile = !!opts.mobile;
      reduce = !!opts.reduceMotion;
      var coarse = false;
      try { coarse = !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches); } catch (e1) { coarse = false; }
      noPointer = reduce || isMobile || coarse;

      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x07080b, 0);
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(FOV, 1, 0.05, 20);
      camera.position.set(0, 0, 2.6);

      mat = new T.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uDepth: { value: 0.32 * PW },
          uSize: { value: new T.Vector2(PW, PH) },
          uRim: { value: 0.35 },
          uExposure: { value: 1 },
          uFade: { value: 0 },
          uGrain: { value: 0 },
          uRimA: { value: new T.Color(0xff2d55) },
          uRimB: { value: new T.Color(0x3d7bff) },
          uKey: { value: new T.Vector3(-0.3, 0.45, 0.84).normalize() }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: T.DoubleSide,                  // keep the far cheek/hair when turned (no egg cut)
        transparent: true,
        extensions: { derivatives: true }
      });
      var geo = new T.PlaneGeometry(PW, PH, isMobile ? 120 : 180, isMobile ? 126 : 190);
      var mesh = new T.Mesh(geo, mat);
      mesh.position.set(-HX, -HY, 0);        // turn about the head centre, not the plane centre
      mesh.frustumCulled = false;            // vertices are displaced in the shader
      group = new T.Group();
      group.visible = false;
      group.add(mesh);
      scene.add(group);

      new T.TextureLoader().load(IMG_SRC, function (tex) {
        try {
          if (!renderer.capabilities.isWebGL2) {   // WebGL1: avoid NPOT resize to 512x512
            tex.generateMipmaps = false;
            tex.minFilter = T.LinearFilter;
          }
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          mat.uniforms.uMap.value = tex;
          loadedAt = nowMs();
          PS.loaded = true;
          emit('portrait:loaded');
        } catch (e2) { PS.failed = true; }
      }, undefined, function () { PS.failed = true; emit('portrait:error'); });

      if (!noPointer) window.addEventListener('mousemove', onMove, { passive: true });
      canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); PS.ready = false; }, false);
      initSequence();

      PS.ready = true;
      var r = canvas.getBoundingClientRect();
      PS.resize(r.width || window.innerWidth, r.height || window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
      return true;
    } catch (err) {
      PS.ready = false;
      return false;
    }
  };

  PS.resize = function (w, h, dpr) {
    if (!renderer) return;
    try {
      W = Math.max(1, w || 1);
      H = Math.max(1, h || 1);
      DPR = clamp(dpr || 1, 0.5, 3);
      renderer.setPixelRatio(DPR);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      placeSeq();
    } catch (err) { /* ignore */ }
  };

  PS.render = function (p, timeMs) {
    if (!PS.ready || !renderer) return;
    try {
      p = clamp(+p || 0, 0, 1);
      var now = +timeMs || 0, t = now / 1000;
      var dt = lastT < 0 ? 0.016 : clamp((now - lastT) / 1000, 0, 0.1);
      lastT = now;
      var exposure = 1 - 0.38 * sstep(0.85, 1.0, p);   // dip at the end to hand over

      if (seq && drawSequence(p, exposure)) {          // frame sequence wins once a frame exists
        if (group.visible) { group.visible = false; renderer.render(scene, camera); }
        return;
      }
      if (!PS.loaded) return;                           // nothing to show until the photo is in
      group.visible = true;

      var e = sstep(0, 1, p), sway = 0, breath = 0;
      if (!reduce) {
        sway = Math.sin(t * 0.55) * 0.012 + Math.sin(t * 0.21 + 1.3) * 0.007;
        breath = Math.sin(t * 1.1);
      }
      if (!noPointer) {
        var k = 1 - Math.exp(-dt * 4);
        ptr.x += (ptr.tx - ptr.x) * k;
        ptr.y += (ptr.ty - ptr.y) * k;
      }
      group.rotation.y = lerp(-0.06, 0.62, e) + sway + ptr.x * 0.04;
      group.rotation.x = 0.02 + breath * 0.004 + ptr.y * 0.04;
      group.position.y = breath * 0.004;
      frame(e);

      var u = mat.uniforms;
      u.uRim.value = lerp(0.35, 1.0, sstep(0.0, 0.8, p));
      u.uExposure.value = exposure;
      u.uGrain.value = reduce ? 0 : Math.floor(t * 24) % 64;
      u.uFade.value = reduce ? 1 : clamp((nowMs() - loadedAt) / 900, 0, 1);
      renderer.render(scene, camera);
    } catch (err) { /* never throw from render */ }
  };
})();
