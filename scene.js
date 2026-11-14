/* HeroScene: the 3D career journey for Ashutosh Kumar's portfolio (Three.js r128, classic script).
   One glowing gold path runs through three stations:
     A  Engineer  (2021-25)  a circuit board whose traces light up
     B  Analyst   (2025-26)  six rings: Lead > Demo > Requirements > UAT > Go-live > Support
     C  Developer (2026-)    a globe with an orbiting satellite and rising growth bars
   main.js calls HeroScene.render(progress 0..1, timeMs) every frame while the hero is on screen. */
(function () {
  'use strict';

  var HS = { ready: false };
  window.HeroScene = HS;

  var T = window.THREE;
  if (!T) { HS.init = function () { return false; }; HS.render = HS.resize = HS.setActive = function () {}; return; }

  var GOLD = 0x3b82f6, GOLD_HI = 0xbfdbfe, BLUE = 0x22d3ee, BG = 0x000000;
  var A = new T.Vector3(0, 0, 0);
  var B = new T.Vector3(14, 2, -22);
  var C = new T.Vector3(-6, 4, -44);

  var renderer, scene, camera, composer, bloom;
  var W = 1, H = 1, mobile = false, reduce = false, active = true;
  var camPosCurve, camTgtCurve, KP = [];
  var tmpPos = new T.Vector3(), tmpTgt = new T.Vector3(), tmpV = new T.Vector3(), tmpM = new T.Matrix4();
  var tmpQ = new T.Quaternion(), tmpS = new T.Vector3(), tmpC = new T.Color();

  // station state
  var traceMesh, traceInfo = [], traceCount = 0, segCount = 0, segTrace = [];
  var electrons, eData = [], traces = [];
  var rings = [], ringLabels = [], flowPts, flowData = [], chainCurve;
  var globe, graticule, satellite, satOrbit, bars, barCount = 0, barH = [];
  var pathPulses, pulseData = [], pathCurve;
  var stars, dotTex;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function makeDotTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    var tex = new T.CanvasTexture(c);
    return tex;
  }

  function labelTexture(text) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 96;
    var tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter;
    tex.userData = { canvas: c, text: text };
    drawLabel(tex);
    return tex;
  }
  function drawLabel(tex) {
    var c = tex.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '500 38px "JetBrains Mono", ui-monospace, Consolas, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2efe9';
    var txt = tex.userData.text.split('').join(String.fromCharCode(8202));
    g.fillText(txt, c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  }

  /* ---------------- builders ---------------- */
  function buildStars() {
    var n = mobile ? 900 : 2400;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 70 + rnd() * 90, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th) + 2;
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7 + 4;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 22;
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m = new T.PointsMaterial({ color: 0x9a9ea7, size: 0.35, map: dotTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    stars = new T.Points(g, m);
    scene.add(stars);
  }

  function buildPath() {
    pathCurve = new T.CatmullRomCurve3([
      new T.Vector3(-26, -5, 28), new T.Vector3(-13, -1.6, 13),
      new T.Vector3(-3.6, 0.105, 2.4), new T.Vector3(3.6, 0.105, -2.2),
      new T.Vector3(8.6, 0.8, -12), new T.Vector3(8.2, 0.6, -20.2),
      new T.Vector3(13, 2.4, -24.6), new T.Vector3(20, 3.8, -23.4),
      new T.Vector3(13, 3.2, -38), new T.Vector3(1.2, 3.6, -47.5),
      new T.Vector3(-9.5, 4.6, -50), new T.Vector3(-24, 6.5, -60)
    ], false, 'catmullrom', 0.4);
    var core = new T.Mesh(new T.TubeGeometry(pathCurve, 600, 0.035, 8, false),
      new T.MeshBasicMaterial({ color: GOLD_HI, toneMapped: false }));
    scene.add(core);
    var halo = new T.Mesh(new T.TubeGeometry(pathCurve, 300, mobile ? 0.16 : 0.11, 8, false),
      new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: mobile ? 0.12 : 0.07, blending: T.AdditiveBlending, depthWrite: false }));
    scene.add(halo);
    var n = mobile ? 6 : 10;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) pulseData.push({ u: i / n, s: 0.018 + rnd() * 0.01 });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    pathPulses = new T.Points(g, new T.PointsMaterial({ color: GOLD_HI, size: 0.9, map: dotTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    scene.add(pathPulses);
  }

  function buildPCB() {
    var grp = new T.Group(); grp.position.copy(A);
    var board = new T.Mesh(new T.BoxGeometry(7.2, 0.18, 4.6),
      new T.MeshStandardMaterial({ color: 0x0c1f18, roughness: 0.55, metalness: 0.35 }));
    grp.add(board);
    var edges = new T.LineSegments(new T.EdgesGeometry(board.geometry),
      new T.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45 }));
    grp.add(edges);
    // chip
    var chip = new T.Mesh(new T.BoxGeometry(1.5, 0.24, 1.5),
      new T.MeshStandardMaterial({ color: 0x14171d, roughness: 0.3, metalness: 0.7 }));
    chip.position.y = 0.21; grp.add(chip);
    var chipEdge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.1, 0.01, 1.1)),
      new T.LineBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 0.8 }));
    chipEdge.position.y = 0.335; grp.add(chipEdge);
    // pins
    var pinGeo = new T.BoxGeometry(0.06, 0.05, 0.16);
    var pinMat = new T.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.3 });
    var pins = new T.InstancedMesh(pinGeo, pinMat, 40);
    var pi = 0;
    for (var side = 0; side < 4; side++) {
      for (var j = 0; j < 10; j++) {
        var o = -0.63 + j * 0.14;
        var x = 0, z = 0, ry = 0;
        if (side === 0) { x = o; z = 0.83; } else if (side === 1) { x = o; z = -0.83; }
        else if (side === 2) { x = 0.83; z = o; ry = Math.PI / 2; } else { x = -0.83; z = o; ry = Math.PI / 2; }
        tmpM.makeRotationY(ry); tmpM.setPosition(x, 0.13, z);
        pins.setMatrixAt(pi++, tmpM);
      }
    }
    grp.add(pins);
    // components
    var capGeo = new T.CylinderGeometry(0.16, 0.16, 0.42, 20);
    var capMat = new T.MeshStandardMaterial({ color: 0x1d2a44, metalness: 0.5, roughness: 0.35 });
    var capTop = new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7 });
    var caps = [[2.6, 1.4], [2.9, 0.8], [-2.7, -1.5], [-2.2, 1.6], [2.4, -1.6]];
    caps.forEach(function (p) {
      var m = new T.Mesh(capGeo, capMat); m.position.set(p[0], 0.3, p[1]); grp.add(m);
      var r = new T.Mesh(new T.RingGeometry(0.1, 0.13, 20), capTop); r.rotation.x = -Math.PI / 2; r.position.set(p[0], 0.515, p[1]); grp.add(r);
    });
    var resGeo = new T.BoxGeometry(0.34, 0.1, 0.14);
    var resMat = new T.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.4, roughness: 0.5 });
    [[1.7, 1.75], [-1.6, -1.8], [-3.0, 0.4], [1.9, -1.2], [-1.3, 1.2], [3.1, -0.5]].forEach(function (p) {
      var m = new T.Mesh(resGeo, resMat); m.position.set(p[0], 0.14, p[1]); grp.add(m);
    });

    // traces (Manhattan routes out from the chip), drawn as instanced thin boxes
    var bx = 3.4, bz = 2.1, segs = [];
    for (var s = 0; s < 4; s++) {
      for (var k = 0; k < 6; k++) {
        var off = -0.55 + k * 0.22;
        var start, dir, perp;
        if (s === 0) { start = new T.Vector3(off, 0, 0.92); dir = new T.Vector3(0, 0, 1); }
        else if (s === 1) { start = new T.Vector3(off, 0, -0.92); dir = new T.Vector3(0, 0, -1); }
        else if (s === 2) { start = new T.Vector3(0.92, 0, off); dir = new T.Vector3(1, 0, 0); }
        else { start = new T.Vector3(-0.92, 0, off); dir = new T.Vector3(-1, 0, 0); }
        perp = new T.Vector3(dir.z, 0, -dir.x).multiplyScalar(rnd() < 0.5 ? 1 : -1);
        var p1 = start.clone().addScaledVector(dir, 0.25 + rnd() * 0.5);
        var p2 = p1.clone().addScaledVector(perp, 0.3 + rnd() * 1.3);
        var p3 = p2.clone().addScaledVector(dir, 0.4 + rnd() * 1.6);
        [p1, p2, p3].forEach(function (p) { p.x = clamp(p.x, -bx, bx); p.z = clamp(p.z, -bz, bz); });
        var pts = [start, p1, p2, p3];
        var lens = [0], tot = 0;
        for (var q = 1; q < pts.length; q++) { tot += pts[q].distanceTo(pts[q - 1]); lens.push(tot); }
        traces.push({ pts: pts, lens: lens, total: tot });
        for (var q2 = 1; q2 < pts.length; q2++) segs.push({ a: pts[q2 - 1], b: pts[q2], t: traces.length - 1 });
      }
    }
    traceCount = traces.length;
    segCount = segs.length;
    var segGeo = new T.BoxGeometry(1, 0.014, 0.045);
    traceMesh = new T.InstancedMesh(segGeo, new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), segCount + traceCount);
    for (var i = 0; i < segCount; i++) {
      var sg = segs[i];
      var len = sg.a.distanceTo(sg.b) + 0.045;
      tmpV.addVectors(sg.a, sg.b).multiplyScalar(0.5);
      var ang = Math.atan2(-(sg.b.z - sg.a.z), sg.b.x - sg.a.x);
      tmpQ.setFromAxisAngle(new T.Vector3(0, 1, 0), ang);
      tmpS.set(len, 1, 1);
      tmpM.compose(new T.Vector3(tmpV.x, 0.098, tmpV.z), tmpQ, tmpS);
      traceMesh.setMatrixAt(i, tmpM);
      segTrace.push(sg.t);
      traceMesh.setColorAt(i, tmpC.setHex(0x1c2a44));
    }
    // pads at trace ends
    for (var t = 0; t < traceCount; t++) {
      var end = traces[t].pts[traces[t].pts.length - 1];
      tmpQ.set(0, 0, 0, 1); tmpS.set(0.13, 1.4, 2.9);
      tmpM.compose(new T.Vector3(end.x, 0.1, end.z), tmpQ, tmpS);
      traceMesh.setMatrixAt(segCount + t, tmpM);
      segTrace.push(t);
      traceMesh.setColorAt(segCount + t, tmpC.setHex(0x1c2a44));
    }
    grp.add(traceMesh);

    // electrons
    var ne = mobile ? 28 : 64;
    var ep = new Float32Array(ne * 3);
    for (var e = 0; e < ne; e++) eData.push({ t: e % traceCount, u: rnd(), s: 0.25 + rnd() * 0.35 });
    var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(ep, 3));
    electrons = new T.Points(eg, new T.PointsMaterial({ color: GOLD_HI, size: 0.28, map: dotTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    grp.add(electrons);

    var glow = new T.PointLight(GOLD, 1.4, 14, 2); glow.position.set(0, 2.2, 0); grp.add(glow);
    grp.rotation.y = -0.18;
    scene.add(grp);
    HS._pcb = grp;
  }

  var STAGES = ['LEAD', 'DEMO', 'REQUIREMENTS', 'UAT', 'GO-LIVE', 'SUPPORT'];
  function buildPipeline() {
    var grp = new T.Group(); grp.position.copy(B);
    var centers = [];
    var torusGeo = new T.TorusGeometry(0.95, 0.07, 18, 80);
    var discGeo = new T.CircleGeometry(0.9, 48);
    for (var k = 0; k < STAGES.length; k++) {
      var c = new T.Vector3(-5 + k * 2, -1.5 + k * 0.6, (k % 2 ? -0.5 : 0.5));
      centers.push(c);
      var mat = new T.MeshStandardMaterial({ color: 0xd4dae4, metalness: 0.9, roughness: 0.2, emissive: GOLD, emissiveIntensity: 0.15 });
      var ring = new T.Mesh(torusGeo, mat);
      ring.position.copy(c); ring.rotation.y = -0.35;
      grp.add(ring);
      var disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }));
      disc.position.copy(c); disc.rotation.y = -0.35; grp.add(disc);
      var tex = labelTexture(STAGES[k]);
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.position.set(c.x, c.y + 1.45, c.z); sp.scale.set(2.6, 0.49, 1);
      grp.add(sp);
      rings.push({ mesh: ring, disc: disc, base: c.clone(), phase: k * 0.9 });
      ringLabels.push(sp);
    }
    chainCurve = new T.CatmullRomCurve3(centers.map(function (c, i) {
      return c.clone();
    }), false, 'catmullrom', 0.5);
    var tube = new T.Mesh(new T.TubeGeometry(chainCurve, 200, 0.03, 8, false),
      new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, toneMapped: false }));
    grp.add(tube);
    var nf = mobile ? 40 : 110;
    var fp = new Float32Array(nf * 3);
    for (var i = 0; i < nf; i++) flowData.push({ u: rnd(), s: 0.04 + rnd() * 0.05, o: (rnd() - 0.5) * 0.12 });
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(fp, 3));
    flowPts = new T.Points(fg, new T.PointsMaterial({ color: GOLD_HI, size: 0.26, map: dotTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    grp.add(flowPts);
    var light = new T.PointLight(GOLD, 1.2, 16, 2); light.position.set(0, 2.5, 3); grp.add(light);
    scene.add(grp);
    HS._pipe = grp;
  }

  function buildGlobe() {
    var grp = new T.Group(); grp.position.copy(C);
    globe = new T.Mesh(new T.SphereGeometry(2.2, 64, 48),
      new T.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.75, metalness: 0.15 }));
    grp.add(globe);
    // graticule
    var verts = [];
    var R = 2.215;
    for (var lat = -60; lat <= 60; lat += 30) {
      var la = lat * Math.PI / 180;
      for (var a = 0; a < 96; a++) {
        var a0 = a / 96 * Math.PI * 2, a1 = (a + 1) / 96 * Math.PI * 2;
        verts.push(R * Math.cos(la) * Math.cos(a0), R * Math.sin(la), R * Math.cos(la) * Math.sin(a0));
        verts.push(R * Math.cos(la) * Math.cos(a1), R * Math.sin(la), R * Math.cos(la) * Math.sin(a1));
      }
    }
    for (var lo = 0; lo < 180; lo += 30) {
      var l = lo * Math.PI / 180;
      for (var b = 0; b < 96; b++) {
        var b0 = b / 96 * Math.PI * 2, b1 = (b + 1) / 96 * Math.PI * 2;
        verts.push(R * Math.sin(b0) * Math.cos(l), R * Math.cos(b0), R * Math.sin(b0) * Math.sin(l));
        verts.push(R * Math.sin(b1) * Math.cos(l), R * Math.cos(b1), R * Math.sin(b1) * Math.sin(l));
      }
    }
    var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    graticule = new T.LineSegments(gg, new T.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.32 }));
    globe.add(graticule);
    // city lights
    var nc = 220, cp = new Float32Array(nc * 3);
    for (var i = 0; i < nc; i++) {
      var th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      cp[i * 3] = 2.23 * Math.sin(ph) * Math.cos(th); cp[i * 3 + 1] = 2.23 * Math.cos(ph); cp[i * 3 + 2] = 2.23 * Math.sin(ph) * Math.sin(th);
    }
    var cg = new T.BufferGeometry(); cg.setAttribute('position', new T.BufferAttribute(cp, 3));
    globe.add(new T.Points(cg, new T.PointsMaterial({ color: GOLD_HI, size: 0.12, map: dotTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    // atmosphere (fresnel)
    var atmo = new T.Mesh(new T.SphereGeometry(2.55, 48, 32), new T.ShaderMaterial({
      uniforms: { c: { value: new T.Color(BLUE) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6); gl_FragColor = vec4(c * f * 1.15, f); }',
      side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false
    }));
    grp.add(atmo);
    // satellite
    satellite = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.46), new T.MeshStandardMaterial({ color: 0xd4dae4, metalness: 0.9, roughness: 0.25 }));
    satellite.add(body);
    var panelMat = new T.MeshStandardMaterial({ color: 0x23345e, metalness: 0.6, roughness: 0.3, emissive: BLUE, emissiveIntensity: 0.25 });
    var pL = new T.Mesh(new T.BoxGeometry(1.0, 0.02, 0.34), panelMat); pL.position.x = -0.68; satellite.add(pL);
    var pR = pL.clone(); pR.position.x = 0.68; satellite.add(pR);
    var dish = new T.Mesh(new T.ConeGeometry(0.11, 0.16, 16, 1, true), new T.MeshBasicMaterial({ color: GOLD_HI, side: T.DoubleSide }));
    dish.position.z = 0.3; dish.rotation.x = Math.PI / 2; satellite.add(dish);
    grp.add(satellite);
    var orbitPts = [];
    for (var o = 0; o <= 128; o++) { var oa = o / 128 * Math.PI * 2; orbitPts.push(new T.Vector3(Math.cos(oa) * 3.1, Math.sin(oa) * 3.1 * Math.sin(0.5), Math.sin(oa) * 3.1 * Math.cos(0.5))); }
    satOrbit = new T.Line(new T.BufferGeometry().setFromPoints(orbitPts), new T.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.25 }));
    grp.add(satOrbit);
    // growth bars
    barCount = mobile ? 11 : 15;
    bars = new T.InstancedMesh(new T.BoxGeometry(0.32, 1, 0.32), new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.4, emissive: GOLD, emissiveIntensity: 0.12 }), barCount);
    for (var k = 0; k < barCount; k++) {
      var f = k / (barCount - 1);
      barH.push(0.35 + Math.pow(f, 1.35) * 2.9);
      tmpC.setHex(GOLD).lerp(new T.Color(GOLD_HI), f);
      bars.setColorAt(k, tmpC);
    }
    grp.add(bars);
    var light = new T.PointLight(BLUE, 1.0, 18, 2); light.position.set(-4, 3, 4); grp.add(light);
    var warm = new T.PointLight(GOLD, 1.0, 16, 2); warm.position.set(4, -1, 5); grp.add(warm);
    scene.add(grp);
    HS._globe = grp;
  }

  function setBars(grow) {
    for (var k = 0; k < barCount; k++) {
      var f = k / (barCount - 1);
      var a = (-70 + 140 * f) * Math.PI / 180;
      var local = clamp(grow * 1.35 - f * 0.35, 0, 1);
      var h = Math.max(0.001, barH[k] * smooth(local));
      tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), a);
      tmpS.set(1, h, 1);
      tmpM.compose(tmpPos.set(Math.sin(a) * 3.9, -2.05 + h / 2, Math.cos(a) * 3.9), tmpQ, tmpS);
      bars.setMatrixAt(k, tmpM);
    }
    bars.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- camera keyframes ---------------- */
  function buildCamera() {
    KP = [
      { p: 0.00, pos: [30, 15, 34], tgt: [3, 1, -17] },
      { p: 0.12, pos: [17, 9.5, 19], tgt: [1, 0.5, -5] },
      { p: 0.22, pos: [5.8, 4.6, 7.4], tgt: [0, 0.1, 0] },
      { p: 0.33, pos: [-4.6, 3.8, 6.8], tgt: [0, 0.1, 0] },
      { p: 0.44, pos: [11.5, 5.2, -8.6], tgt: [12.4, 2.6, -22] },
      { p: 0.55, pos: [17, 4.8, -9.8], tgt: [13.2, 2.9, -22] },
      { p: 0.66, pos: [5.5, 7.4, -29.5], tgt: [-6.5, 3.4, -44] },
      { p: 0.77, pos: [-14, 8.2, -30], tgt: [-6.5, 3.4, -44] },
      { p: 0.90, pos: [44, 21, -19], tgt: [4, 1.5, -22] },
      { p: 1.00, pos: [43, 25, -13], tgt: [4, 1.5, -22] }
    ];
    if (mobile) {
      // a phone is too narrow for the whole journey: end on a wide shot of the growth station instead
      KP[8] = { p: 0.90, pos: [10, 14, -21], tgt: [-5, 3, -44] };
      KP[9] = { p: 1.00, pos: [4, 16, -18], tgt: [-5, 3, -44] };
    }
    camPosCurve = new T.CatmullRomCurve3(KP.map(function (k) { return new T.Vector3(k.pos[0], k.pos[1], k.pos[2]); }), false, 'catmullrom', 0.35);
    camTgtCurve = new T.CatmullRomCurve3(KP.map(function (k) { return new T.Vector3(k.tgt[0], k.tgt[1], k.tgt[2]); }), false, 'catmullrom', 0.35);
  }
  var CH_KEY = [0, 2, 4, 6, 8]; // reduced motion: one fixed shot per chapter
  function chapterOf(p) { return p < 0.16 ? 0 : p < 0.37 ? 1 : p < 0.59 ? 2 : p < 0.8 ? 3 : 4; }
  function camAt(p) {
    var n = KP.length, u;
    if (reduce) {
      u = CH_KEY[chapterOf(p)] / (n - 1);
    } else {
      var i = 0;
      while (i < n - 2 && p > KP[i + 1].p) i++;
      var l = smooth((p - KP[i].p) / (KP[i + 1].p - KP[i].p));
      u = (i + l) / (n - 1);
    }
    camPosCurve.getPoint(u, tmpPos);
    camTgtCurve.getPoint(u, tmpTgt);
  }

  function frameOffset(p) {
    // shift the rendered image so the subject sits beside the text
    var x, y;
    if (mobile) { x = 0; y = lerp(0.17, 0.3, smooth((p - 0.76) / 0.1)); }
    else {
      var f = smooth((p - 0.76) / 0.1);
      x = lerp(-0.17, 0.0, f);
      y = lerp(0.0, 0.17, f);
    }
    camera.setViewOffset(W, H, x * W, y * H, W, H);
  }

  /* ---------------- public API ---------------- */
  HS.init = function (canvas, o) {
    try {
      o = o || {};
      mobile = !!o.mobile; reduce = !!o.reduceMotion;
      var test = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!test) return false;
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor(BG, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
      renderer.setSize(W, H, false);
      scene = new T.Scene();
      scene.fog = new T.FogExp2(BG, mobile ? 0.016 : 0.015);
      camera = new T.PerspectiveCamera(mobile ? 52 : 42, W / H, 0.1, 400);
      dotTex = makeDotTexture();

      scene.add(new T.AmbientLight(0x3a4152, 0.9));
      var key = new T.DirectionalLight(0xffe7c4, 1.25); key.position.set(12, 22, 14); scene.add(key);
      var rim = new T.DirectionalLight(BLUE, 0.9); rim.position.set(-14, 6, -26); scene.add(rim);

      buildStars(); buildPath(); buildPCB(); buildPipeline(); buildGlobe(); buildCamera();
      setBars(0);

      if (!mobile && T.EffectComposer && T.RenderPass && T.UnrealBloomPass) {
        try {
          composer = new T.EffectComposer(renderer);
          composer.addPass(new T.RenderPass(scene, camera));
          bloom = new T.UnrealBloomPass(new T.Vector2(W, H), 0.85, 0.55, 0.24);
          composer.addPass(bloom);
          composer.setSize(W, H);
        } catch (e) { composer = null; }
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { ringLabels.forEach(function (s) { drawLabel(s.material.map); }); });
      }
      HS.ready = true;
      HS.render(0, 0);
      return true;
    } catch (err) {
      HS.ready = false;
      return false;
    }
  };

  HS.resize = function (w, h, dpr) {
    if (!renderer) return;
    try {
      W = Math.max(1, w); H = Math.max(1, h);
      renderer.setPixelRatio(dpr || 1);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      if (composer) { composer.setPixelRatio ? composer.setPixelRatio(dpr || 1) : null; composer.setSize(W, H); }
      if (bloom) bloom.resolution.set(W, H);
    } catch (e) { /* ignore */ }
  };

  HS.setActive = function (v) { active = !!v; };

  HS.render = function (p, timeMs) {
    if (!HS.ready) return;
    try {
      p = clamp(p || 0, 0, 1);
      var t = reduce ? 0 : (timeMs || 0) / 1000;

      // camera
      camAt(p);
      if (!reduce && p > 0.86) {
        var orbit = Math.sin(t * 0.12) * 0.12 * smooth((p - 0.86) / 0.08);
        tmpV.subVectors(tmpPos, tmpTgt);
        var cs = Math.cos(orbit), sn = Math.sin(orbit);
        var x = tmpV.x * cs - tmpV.z * sn, z = tmpV.x * sn + tmpV.z * cs;
        tmpPos.set(tmpTgt.x + x, tmpPos.y, tmpTgt.z + z);
      }
      if (!reduce) { tmpPos.y += Math.sin(t * 0.6) * 0.08; }
      camera.position.copy(tmpPos);
      camera.lookAt(tmpTgt);
      frameOffset(p);

      var finale = smooth((p - 0.8) / 0.1);
      // clearer air for the wide shots (intro and finale), denser near the stations
      var fogBase = mobile ? 0.016 : 0.015;
      scene.fog.density = lerp(lerp(0.008, fogBase, smooth((p - 0.08) / 0.12)), 0.0055, finale);

      // A: traces light up in sequence
      var lit = Math.max(smooth((p - 0.1) / 0.2), finale);
      for (var i = 0; i < segTrace.length; i++) {
        var tr = segTrace[i];
        var on = clamp(lit * (traceCount + 4) - tr, 0, 1);
        var pulse = reduce ? 0.6 : 0.6 + 0.4 * Math.sin(t * 3.2 - tr * 0.7);
        var k = 0.16 + on * (0.55 + 0.45 * pulse);
        tmpC.setRGB(0.42 * k, 0.65 * k, 1.0 * k);
        traceMesh.setColorAt(i, tmpC);
      }
      traceMesh.instanceColor.needsUpdate = true;
      var ep = electrons.geometry.attributes.position.array;
      for (var e = 0; e < eData.length; e++) {
        var d = eData[e], trc = traces[d.t];
        if (!reduce) d.u = (d.u + d.s * 0.012) % 1;
        var dist = d.u * trc.total, sgi = 1;
        while (sgi < trc.lens.length - 1 && trc.lens[sgi] < dist) sgi++;
        var la = trc.lens[sgi - 1], lb = trc.lens[sgi];
        var f = lb > la ? (dist - la) / (lb - la) : 0;
        var pa = trc.pts[sgi - 1], pb = trc.pts[sgi];
        var visible = clamp(lit * (traceCount + 4) - d.t, 0, 1) > 0.5;
        ep[e * 3] = lerp(pa.x, pb.x, f);
        ep[e * 3 + 1] = visible ? 0.16 : -50;
        ep[e * 3 + 2] = lerp(pa.z, pb.z, f);
      }
      electrons.geometry.attributes.position.needsUpdate = true;
      if (!reduce) HS._pcb.position.y = Math.sin(t * 0.8) * 0.06;

      // B: pipeline stage progression
      var stageF = Math.max(clamp((p - 0.38) / 0.18, 0, 1) * STAGES.length, finale * STAGES.length);
      var activeStage = Math.min(STAGES.length - 1, Math.floor(stageF));
      for (var r = 0; r < rings.length; r++) {
        var rg = rings[r];
        var state = r < activeStage ? 1 : (r === activeStage && stageF > 0 ? 2 : 0);
        if (finale > 0.5) state = 1;
        var pul = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 4 + r);
        rg.mesh.material.emissiveIntensity = state === 2 ? 1.4 * pul : state === 1 ? 0.55 : 0.08;
        rg.disc.material.opacity = state === 2 ? 0.16 : state === 1 ? 0.07 : 0.03;
        ringLabels[r].material.opacity = state === 2 ? 1 : state === 1 ? 0.7 : 0.32;
        if (!reduce) {
          rg.mesh.position.y = rg.base.y + Math.sin(t * 1.1 + rg.phase) * 0.06;
          rg.mesh.rotation.z = Math.sin(t * 0.5 + rg.phase) * 0.08;
        }
      }
      var fp = flowPts.geometry.attributes.position.array;
      var reach = Math.min(1, (activeStage + (stageF > 0 ? 1 : 0)) / STAGES.length + finale);
      for (var q = 0; q < flowData.length; q++) {
        var fd = flowData[q];
        if (!reduce) fd.u = (fd.u + fd.s * 0.01) % 1;
        var uu = fd.u * Math.max(0.02, reach);
        chainCurve.getPoint(uu, tmpV);
        fp[q * 3] = tmpV.x; fp[q * 3 + 1] = tmpV.y + fd.o; fp[q * 3 + 2] = tmpV.z + fd.o;
      }
      flowPts.geometry.attributes.position.needsUpdate = true;

      // C: globe, satellite, growth
      globe.rotation.y = (reduce ? 0 : t * 0.08) + p * 1.2;
      var sa = (reduce ? 1.2 : t * 0.45) + p * 2;
      satellite.position.set(Math.cos(sa) * 3.1, Math.sin(sa) * 3.1 * Math.sin(0.5), Math.sin(sa) * 3.1 * Math.cos(0.5));
      satellite.lookAt(C.x, C.y, C.z); satellite.rotateY(Math.PI / 2);
      var grow = Math.max(smooth((p - 0.6) / 0.17), finale);
      if (reduce) grow = p >= 0.59 ? 1 : 0;
      setBars(grow);

      // path pulses
      var pp = pathPulses.geometry.attributes.position.array;
      for (var s = 0; s < pulseData.length; s++) {
        var pd = pulseData[s];
        if (!reduce) pd.u = (pd.u + pd.s * 0.004) % 1;
        pathCurve.getPoint(pd.u, tmpV);
        pp[s * 3] = tmpV.x; pp[s * 3 + 1] = tmpV.y; pp[s * 3 + 2] = tmpV.z;
      }
      pathPulses.geometry.attributes.position.needsUpdate = true;
      if (!reduce) stars.rotation.y = t * 0.004;

      if (composer) composer.render(); else renderer.render(scene, camera);
    } catch (err) { /* never throw */ }
  };
})();
