/* ============================================================
   DICE3D — a small real-3D dice engine drawn with Canvas 2D.
   Shared by Yahtzee and Liar's Dice (games-dice.js).

   · Rounded-cube dice are a real mesh (flat faces + a two-step bevel)
     projected through a tilted perspective camera. Back-face culling
     inside a die (it is convex) + a painter's sort between objects.
   · Per-quad lighting: a warm overhead point lamp, a cool fill, a felt
     bounce from below, ambient occlusion near the cloth and a Blinn
     specular that makes the bevels catch the light. Pips are real 3D
     discs, drawn as a shadowed recess.
   · Rolls are simulated ONCE up front (fixed 120 Hz steps, seeded,
     trig-free: only + − × ÷ and sqrt, which IEEE-754 makes bit-exact
     on every phone) and then played back, so both phones see the same
     tumble. Every die lands on its committed value exactly: the free
     tumble is eased to the nearest face-flat pose, and the die's pip
     labelling is re-based by a cube symmetry so THAT face shows the
     value — nothing snaps.
   · The table (felt, padded rail, lamp pool, bokeh) is a static layer
     rendered once per size. The camera "push-in" and shake are 2D on
     top of the fixed 3D view, so the layer never has to be re-projected.
   · The RAF loop idles when nothing moves and stops if the canvas is
     detached; wake() restarts it. prefers-reduced-motion → calm mode:
     the games skip straight to final poses with a short fade.
   ============================================================ */
(function () {
  'use strict';
  const SQ = Math.sqrt;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const EASE = { linear: t => t, smooth, out: easeOut, inOut: easeInOut,
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    in: t => t * t * t };

  /* ---------------- quaternions (w,x,y,z) ---------------- */
  function qmul(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
  }
  function qn(q) { const l = SQ(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1; return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l }; }
  function qmat(q, m) {
    const w = q.w, x = q.x, y = q.y, z = q.z;
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
    m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
    m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
    return m;
  }
  // shortest-arc rotation taking unit vector a onto unit vector b (trig-free)
  function qFromTo(ax, ay, az, bx, by, bz) {
    const d = ax * bx + ay * by + az * bz;
    if (d < -0.999999) {
      let px = 0, py = az, pz = -ay;                     // a × x̂
      if (py * py + pz * pz < 1e-6) { px = -az; py = 0; pz = ax; }   // a × ŷ
      const l = SQ(px * px + py * py + pz * pz);
      return { w: 0, x: px / l, y: py / l, z: pz / l };
    }
    return qn({ w: 1 + d, x: ay * bz - az * by, y: az * bx - ax * bz, z: ax * by - ay * bx });
  }
  function qlerp(a, b, t) {
    const s = (a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z) < 0 ? -1 : 1;
    return qn({ w: a.w + (s * b.w - a.w) * t, x: a.x + (s * b.x - a.x) * t, y: a.y + (s * b.y - a.y) * t, z: a.z + (s * b.z - a.z) * t });
  }
  const qYaw = a => ({ w: Math.cos(a / 2), x: 0, y: Math.sin(a / 2), z: 0 });

  /* ---------------- seeded PRNG ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261 >>> 0; str = String(str);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------------- the die: faces, labels, mesh ---------------- */
  // local die space: half-size 1; opposite faces sum to 7
  const FACES = [
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], val: 1 },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], val: 6 },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], val: 2 },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], val: 5 },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], val: 3 },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], val: 4 },
  ];
  const FACE_OF = [];
  FACES.forEach((f, i) => { FACE_OF[f.val] = i; });
  const PIP_UV = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
  };
  const INNER = 0.8, BEV = 0.2, PIP_OFF = 0.5, PIP_R = 0.165, PIP_SEG = 16;
  // orientation that puts value v on top (yaw 0)
  const Q_UP = [null];
  for (let v = 1; v <= 6; v++) { const n = FACES[FACE_OF[v]].n; Q_UP[v] = qFromTo(n[0], n[1], n[2], 0, 1, 0); }

  function buildMesh() {
    const T = [-1, -(INNER + BEV / 2), -INNER, INNER, INNER + BEV / 2, 1];
    const V = [], N = [], quads = [];
    FACES.forEach((F, fi) => {
      const base = V.length / 3;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
        const cu = T[i], cv = T[j];
        const c = [0, 1, 2].map(k => F.n[k] + F.u[k] * cu + F.v[k] * cv);
        const q = c.map(x => clamp(x, -INNER, INNER));
        const d = [c[0] - q[0], c[1] - q[1], c[2] - q[2]], l = SQ(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
        V.push(q[0] + d[0] / l * BEV, q[1] + d[1] / l * BEV, q[2] + d[2] / l * BEV);
        N.push(d[0] / l, d[1] / l, d[2] / l);
      }
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        const a = base + j * 6 + i, b = a + 1, c = a + 7, d = a + 6;
        let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
        [a, b, c, d].forEach(k => { nx += N[k * 3]; ny += N[k * 3 + 1]; nz += N[k * 3 + 2]; cx += V[k * 3]; cy += V[k * 3 + 1]; cz += V[k * 3 + 2]; });
        const l = SQ(nx * nx + ny * ny + nz * nz) || 1;
        quads.push({ a, b, c, d, f: fi, flat: i === 2 && j === 2, nx: nx / l, ny: ny / l, nz: nz / l, cx: cx / 4, cy: cy / 4, cz: cz / 4 });
      }
    });
    // pips as real 3D circles lying on each face
    const pips = FACES.map(F => (PIP_UV[F.val] || []).map(([pu, pv]) => {
      const cx = F.n[0] + (F.u[0] * pu + F.v[0] * pv) * PIP_OFF, cy = F.n[1] + (F.u[1] * pu + F.v[1] * pv) * PIP_OFF, cz = F.n[2] + (F.u[2] * pu + F.v[2] * pv) * PIP_OFF;
      const pts = new Float64Array(PIP_SEG * 3);
      for (let s = 0; s < PIP_SEG; s++) {
        const a = s / PIP_SEG * Math.PI * 2, ca = Math.cos(a) * PIP_R, sa = Math.sin(a) * PIP_R;
        pts[s * 3] = cx + F.u[0] * ca + F.v[0] * sa; pts[s * 3 + 1] = cy + F.u[1] * ca + F.v[1] * sa; pts[s * 3 + 2] = cz + F.u[2] * ca + F.v[2] * sa;
      }
      return { pts, cx, cy, cz };
    }));
    return { V: new Float64Array(V), N: new Float64Array(N), quads, nv: V.length / 3, pips };
  }
  const MESH = buildMesh();

  // which value is facing up for a render orientation (verification + tests)
  function upValue(q) {
    const m = qmat(q, new Array(9));
    let best = -2, val = 0;
    FACES.forEach(F => { const wy = m[3] * F.n[0] + m[4] * F.n[1] + m[5] * F.n[2]; if (wy > best) { best = wy; val = F.val; } });
    return { value: val, flat: best };
  }
  // vertical half-extent of a rotated rounded die of half-size s
  function extent(q, s) {
    const m = qmat(q, EXT_M);
    return s * (INNER * (Math.abs(m[3]) + Math.abs(m[4]) + Math.abs(m[5])) + BEV);
  }
  const EXT_M = new Array(9);

  /* ---------------- roll simulation (pure, deterministic) ----------------
     opts: { seed, dice:[{value, size}], bounds:{x0,x1,z0,z1}, entry:{x,z,y,spread} }
     → { n, tracks:[{fr: Float64Array(n*8) [x,y,z,qw,qx,qy,qz,_], hits:[[frame,strength]]}] }   */
  const SIM_HZ = 120, FRAMES = 100;
  function simulate(opts) {
    const R = rng(opts.seed >>> 0), B = opts.bounds, en = opts.entry || {};
    const G = 42, n = opts.dice.length;
    const bodies = opts.dice.map((d, i) => {
      const s = (d.size || 1) / 2;
      const spread = en.spread != null ? en.spread : 1.2;
      const x = (en.x || 0) + (i - (n - 1) / 2) * spread * (d.size || 1) + (R() - 0.5) * 0.5;
      // a random start orientation from 4 uniform numbers (normalised) — no trig
      const q = qn({ w: R() * 2 - 1, x: R() * 2 - 1, y: R() * 2 - 1, z: R() * 2 - 1 });
      return {
        s, rad: s * 1.06, col: s * 1.44, value: d.value,
        p: { x, y: (en.y || 2.3) + R() * 0.9, z: (en.z != null ? en.z : B.z1 + 1.4) + (R() - 0.5) * 0.7 },
        v: { x: (R() - 0.5) * 3 - x * 0.35, y: 1.5 + R() * 2.2, z: -(9.5 + R() * 3.5) },
        w: { x: (R() - 0.5) * 26, y: (R() - 0.5) * 16, z: (R() - 0.5) * 26 },
        q, inside: false, hits: [], fr: new Float64Array(FRAMES * 8), hA: new Float64Array(FRAMES),
      };
    });
    const dt = 1 / SIM_HZ, steps = FRAMES * 2;
    for (let st = 0; st < steps; st++) {
      const t = st * dt, frame = st >> 1;
      const late = t > 0.78 ? Math.min(1, (t - 0.78) / 0.35) : 0;
      for (const b of bodies) {
        const p = b.p, v = b.v, w = b.w;
        v.y -= G * dt;
        p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
        // floor
        if (p.y < b.rad) {
          p.y = b.rad;
          if (v.y < -0.9) {
            const imp = -v.y;
            v.y = imp * 0.36; v.x *= 0.84; v.z *= 0.84;
            const rs = 1 / b.rad;
            w.x = w.x * 0.45 + v.z * rs * 0.55 + (R() - 0.5) * imp * 1.2;
            w.z = w.z * 0.45 - v.x * rs * 0.55 + (R() - 0.5) * imp * 1.2;
            w.y = w.y * 0.7 + (R() - 0.5) * imp * 0.8;
            if (imp > 2.5) b.hits.push([frame, Math.min(1, imp / 12)]);
            b.inside = true;
          } else {
            v.y = 0;
            const f = 1 - 2.4 * dt; v.x *= f; v.z *= f;                  // rolling friction on the cloth
            const k = Math.min(1, 9 * dt), rs = 1 / b.rad;
            w.x += (v.z * rs - w.x) * k; w.z += (-v.x * rs - w.z) * k; w.y *= 1 - 3 * dt;
          }
        }
        if (!b.inside && p.z < B.z1 - b.col) b.inside = true;
        if (b.inside) {                                                   // the rails
          const m = b.col;
          if (p.x < B.x0 + m) { p.x = B.x0 + m; if (v.x < 0) { if (-v.x > 2.5) b.hits.push([frame, Math.min(1, -v.x / 14)]); v.x = -v.x * 0.5; v.z *= 0.9; w.y += (R() - 0.5) * 8; w.z += v.x * 0.8; } }
          if (p.x > B.x1 - m) { p.x = B.x1 - m; if (v.x > 0) { if (v.x > 2.5) b.hits.push([frame, Math.min(1, v.x / 14)]); v.x = -v.x * 0.5; v.z *= 0.9; w.y += (R() - 0.5) * 8; w.z += v.x * 0.8; } }
          if (p.z < B.z0 + m) { p.z = B.z0 + m; if (v.z < 0) { if (-v.z > 2.5) b.hits.push([frame, Math.min(1, -v.z / 14)]); v.z = -v.z * 0.46; v.x *= 0.9; w.y += (R() - 0.5) * 8; w.x -= v.z * 0.8; } }
          if (p.z > B.z1 - m) { p.z = B.z1 - m; if (v.z > 0) { if (v.z > 2.5) b.hits.push([frame, Math.min(1, v.z / 14)]); v.z = -v.z * 0.46; v.x *= 0.9; w.y += (R() - 0.5) * 8; w.x -= v.z * 0.8; } }
        }
        if (late) { const f = 1 - late * 4.2 * dt; v.x *= f; v.z *= f; w.x *= f; w.y *= f; w.z *= f; }
      }
      // die ↔ die (spheres that enclose the footprint, so settled dice never overlap)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = bodies[i], b = bodies[j];
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, md = a.col + b.col;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= md * md || d2 < 1e-9) continue;
        const d = SQ(d2), nx = dx / d, ny = dy / d, nz = dz / d, push = (md - d) / 2;
        a.p.x -= nx * push; a.p.z -= nz * push; b.p.x += nx * push; b.p.z += nz * push;
        if (a.p.y - a.rad > 0.001) a.p.y -= ny * push; if (b.p.y - b.rad > 0.001) b.p.y += ny * push;
        const rv = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
        if (rv < 0) {
          const j2 = -(1 + 0.42) * rv / 2;
          a.v.x -= j2 * nx; a.v.y -= j2 * ny; a.v.z -= j2 * nz; b.v.x += j2 * nx; b.v.y += j2 * ny; b.v.z += j2 * nz;
          const kick = (R() - 0.5) * 10;
          a.w.y += kick; b.w.y -= kick;
          if (-rv > 2.5) a.hits.push([frame, Math.min(1, -rv / 12)]);
        }
      }
      // integrate orientation: q += ½·dt·(ω ⊗ q)
      for (const b of bodies) {
        const q = b.q, w = b.w, h = 0.5 * dt;
        b.q = qn({
          w: q.w + h * (-w.x * q.x - w.y * q.y - w.z * q.z),
          x: q.x + h * (w.x * q.w + w.y * q.z - w.z * q.y),
          y: q.y + h * (-w.x * q.z + w.y * q.w + w.z * q.x),
          z: q.z + h * (w.x * q.y - w.y * q.x + w.z * q.w),
        });
        if (st & 1) {
          const o = frame * 8;
          b.fr[o] = b.p.x; b.fr[o + 1] = b.p.y; b.fr[o + 2] = b.p.z;
          b.fr[o + 3] = b.q.w; b.fr[o + 4] = b.q.x; b.fr[o + 5] = b.q.y; b.fr[o + 6] = b.q.z;
          b.hA[frame] = Math.max(0, b.p.y - b.rad);
        }
      }
    }
    // settle: ease the free tumble onto the nearest face-flat pose, then re-base the labels
    const FA = 50, FB = 88;
    const tracks = bodies.map(b => {
      const o = (FRAMES - 1) * 8;
      const qe = { w: b.fr[o + 3], x: b.fr[o + 4], y: b.fr[o + 5], z: b.fr[o + 6] };
      const m = qmat(qe, new Array(9));
      let best = 0, ax = 0, sg = 1;
      for (let k = 0; k < 3; k++) { const y = m[3 + k]; if (Math.abs(y) > Math.abs(best)) { best = y; ax = k; sg = y < 0 ? -1 : 1; } }
      // world direction of that local axis, and the local axis itself
      const wx = m[ax] * sg, wy = m[3 + ax] * sg, wz = m[6 + ax] * sg;
      const qFlat = qn(qmul(qFromTo(wx, wy, wz, 0, 1, 0), qe));
      const dl = [0, 0, 0]; dl[ax] = sg;
      const nv = FACES[FACE_OF[b.value]].n;
      const R0 = qFromTo(nv[0], nv[1], nv[2], dl[0], dl[1], dl[2]);   // a cube symmetry: value v → the up axis
      const fr = new Float64Array(FRAMES * 8);
      const fx = b.fr[o], fz = b.fr[o + 2];
      for (let f = 0; f < FRAMES; f++) {
        const k = f * 8, bl = smooth((f - FA) / (FB - FA));
        const qs = { w: b.fr[k + 3], x: b.fr[k + 4], y: b.fr[k + 5], z: b.fr[k + 6] };
        const qr = qmul(bl > 0 ? qlerp(qs, qFlat, bl) : qs, R0);
        const settle = smooth((f - FB) / (FRAMES - 1 - FB));
        fr[k] = b.fr[k] + (fx - b.fr[k]) * settle; fr[k + 2] = b.fr[k + 2] + (fz - b.fr[k + 2]) * settle;
        fr[k + 1] = extent(qr, b.s) + b.hA[f] * (1 - settle);
        fr[k + 3] = qr.w; fr[k + 4] = qr.x; fr[k + 5] = qr.y; fr[k + 6] = qr.z;
      }
      // the last frame is EXACT: value up, perfectly flat, resting on the cloth
      const qf = qmul(qFlat, R0), L = (FRAMES - 1) * 8;
      fr[L + 1] = b.s; fr[L + 3] = qf.w; fr[L + 4] = qf.x; fr[L + 5] = qf.y; fr[L + 6] = qf.z;
      return { fr, hits: b.hits };
    });
    return { n: FRAMES, tracks };
  }

  /* ---------------- materials ---------------- */
  const hex3 = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0xffffff; return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
  const MATS = {
    ivory: { base: [0.95, 0.93, 0.87], pip: [0.10, 0.09, 0.13], spec: 0.55, shin: 46, paint: false },
  };
  function material(hex, pipHex, o) {
    return Object.assign({ base: hex3(hex), pip: pipHex ? hex3(pipHex) : [0.97, 0.97, 0.98], spec: 0.8, shin: 60 }, o || {});
  }

  /* ======================== the scene ======================== */
  function create(opts) {
    opts = opts || {};
    const VW = opts.vw || 1000, VH = opts.vh || 625;
    const T = Object.assign({ hx: 4.8, hz: 3.1, rc: 0.6, rail: 0.95, railH: 0.55, felt: [0.035, 0.27, 0.235], tray: null, logo: null }, opts.table || {});
    const camO = opts.camera || {};
    const eye = camO.eye || [0, 10.5, 8.8], tgt = camO.target || [0, 0, 0.5];
    const E = { x: eye[0], y: eye[1], z: eye[2] };
    let F = { x: tgt[0] - E.x, y: tgt[1] - E.y, z: tgt[2] - E.z };
    { const l = SQ(F.x * F.x + F.y * F.y + F.z * F.z); F = { x: F.x / l, y: F.y / l, z: F.z / l }; }
    let Rt = { x: -F.z, y: 0, z: F.x }; { const l = SQ(Rt.x * Rt.x + Rt.z * Rt.z); Rt = { x: Rt.x / l, y: 0, z: Rt.z / l }; }
    const Up = { x: Rt.y * F.z - Rt.z * F.y, y: Rt.z * F.x - Rt.x * F.z, z: Rt.x * F.y - Rt.y * F.x };
    let FOC = 1, OX = 0, OY = 0;
    const LP = opts.light || { x: -1.4, y: 9.5, z: -0.6 };
    const FILL = (() => { const v = [0.75, 0.5, 0.45], l = SQ(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return v.map(x => x / l); })();

    function projRaw(x, y, z, out) {
      const dx = x - E.x, dy = y - E.y, dz = z - E.z;
      const cz = dx * F.x + dy * F.y + dz * F.z;
      out.x = OX + FOC * (dx * Rt.x + dy * Rt.y + dz * Rt.z) / cz;
      out.y = OY - FOC * (dx * Up.x + dy * Up.y + dz * Up.z) / cz;
      out.s = FOC / cz;
      return out;
    }
    const proj = (x, y, z) => projRaw(x, y, z, {});
    // fit the table into the frame
    (function fitCam() {
      const o = T.rail, pts = [];
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { pts.push([a * (T.hx + o), T.railH, b * (T.hz + o)]); if (b > 0) pts.push([a * (T.hx + o), camO.skirt != null ? camO.skirt : -0.25, b * (T.hz + o)]); });
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const r = {};
      pts.forEach(p => { projRaw(p[0], p[1], p[2], r); x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); });
      FOC = Math.min(VW * (camO.fillW || 1.0) / (x1 - x0), VH * (camO.fillH || 0.97) / (y1 - y0));
      OX = VW / 2 - FOC * (x0 + x1) / 2; OY = VH / 2 - FOC * (y0 + y1) / 2 + (camO.dy || 0);
    })();

    const calm = opts.calm != null ? !!opts.calm : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const sc = {
      VW, VH, T, E, calm, proj, dice: [], cups: [], parts: [], tweens: [], motes: [],
      time: 0, timeScale: 1, cam: { x: VW / 2, y: VH / 2, z: 1 }, camT: { x: VW / 2, y: VH / 2, z: 1 }, camRate: 0.07,
      shakeAmt: 0, sx: 0, sy: 0, cv: null, g: null, raf: 0, last: 0, W: 0, H: 0, dpr: 1, k: 1, layer: null,
      onTable: null, onOverlay: null, onHit: null, onIdle: null, tag: opts.tag || '',
    };
    const PT = {};                       // scratch point
    const M9 = new Array(9);

    /* ---------- canvas lifecycle ---------- */
    sc.canvas = function () {
      if (sc.cv) return sc.cv;
      const cv = document.createElement('canvas'); cv.className = opts.className || 'd3-cv';
      sc.cv = cv; sc.g = cv.getContext('2d');
      if (window.ResizeObserver) new ResizeObserver(() => sc.fit()).observe(cv); else window.addEventListener('resize', () => sc.fit());
      return cv;
    };
    sc.attach = function (parent) { const cv = sc.canvas(); if (cv.parentNode !== parent) parent.append(cv); sc.fit(); sc.wake(); return cv; };
    sc.fit = function () {
      const cv = sc.cv; if (!cv) return;
      const w = cv.clientWidth; if (!w) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.style.height = Math.round(w * VH / VW) + 'px';
      const W = Math.round(w * dpr), H = Math.round(w * VH / VW * dpr);
      if (W === sc.W && H === sc.H) return;
      sc.W = W; sc.H = H; sc.dpr = dpr; sc.k = W / VW;
      cv.width = W; cv.height = H; sc.layer = null; sc.vign = null;
      draw();                             // resizing wipes the bitmap — repaint now, even if the loop is idle
    };
    sc.wake = function () { if (!sc.raf && sc.cv && sc.cv.isConnected) { sc.last = 0; sc.raf = requestAnimationFrame(loop); } };
    sc.redraw = function () { draw(); };
    function loop(now) {
      sc.raf = 0;
      if (!sc.cv || !sc.cv.isConnected) return;               // detached: stop cleanly
      const dt = sc.last ? clamp(now - sc.last, 0, 50) : 16.7; sc.last = now;
      step(dt); draw();
      if (busy()) { if (!sc.raf) sc.raf = requestAnimationFrame(loop); }   // a tween may already have woken a loop
      else if (sc.onIdle) { try { sc.onIdle(); } catch (e) { console.error(e); } }
    }

    /* ---------- timeline ---------- */
    sc.tween = function (ms, fn, o) {
      o = o || {};
      const tw = { t0: sc.time + (o.delay || 0), dur: Math.max(0, ms), fn, ease: EASE[o.ease || 'inOut'] || o.ease, started: false };
      sc.tweens.push(tw); sc.wake(); return tw;
    };
    sc.after = (ms, fn) => sc.tween(0, p => { if (p >= 1) fn(); }, { delay: ms, ease: 'linear' });
    sc.clearTimeline = function () { sc.tweens.length = 0; };

    /* ---------- dice ---------- */
    sc.getDie = id => sc.dice.find(d => d.id === id);
    sc.setDie = function (o) {
      let d = sc.getDie(o.id);
      if (!d) { d = { id: o.id, pos: { x: 0, y: 0, z: 0 }, q: { w: 1, x: 0, y: 0, z: 0 }, alpha: 1, scale: 1, glow: null, dim: 0, rim: null }; sc.dice.push(d); }
      if (o.value != null) d.value = o.value;
      if (o.owner != null) d.owner = o.owner;
      d.size = o.size || d.size || 1; d.mat = o.mat || d.mat || MATS.ivory;
      if (o.x != null) {
        d.pos = { x: o.x, y: d.size / 2, z: o.z };
        d.q = qmul(qYaw(o.yaw || 0), Q_UP[d.value]);
        d.track = null; d.glide = null; d.fade = null;
      }
      if (o.alpha != null) d.alpha = o.alpha;
      d.hidden = !!o.hidden; d.gone = false;
      sc.wake(); return d;
    };
    sc.removeDie = function (id) { sc.dice = sc.dice.filter(d => d.id !== id); sc.wake(); };
    sc.clearDice = function () { sc.dice.length = 0; sc.wake(); };
    sc.fadeDie = function (id, to, ms, remove) {
      const d = sc.getDie(id); if (!d) return;
      d.fade = { from: d.alpha, to, t0: sc.time, dur: Math.max(1, ms), remove: !!remove }; sc.wake();
    };
    sc.restPose = (value, yaw) => qmul(qYaw(yaw || 0), Q_UP[value]);
    // play a simulated roll. dice: [{id, value, size, mat, owner}] (same order as the sim input)
    sc.playRoll = function (sim, dice, o) {
      o = o || {};
      dice.forEach((spec, i) => {
        const d = sc.setDie(spec);
        d.track = { fr: sim.tracks[i].fr, hits: sim.tracks[i].hits.slice(), n: sim.n, f: 0, hi: 0 };
        d.glide = null; d.fade = null; d.alpha = 1; d.hidden = false;
        sampleTrack(d);
      });
      sc.wake();
      return sim.n / 60 * 1000;
    };
    sc.finalPose = function (sim, i) {
      const fr = sim.tracks[i].fr, L = (sim.n - 1) * 8;
      return { pos: { x: fr[L], y: fr[L + 1], z: fr[L + 2] }, q: { w: fr[L + 3], x: fr[L + 4], y: fr[L + 5], z: fr[L + 6] } };
    };
    sc.placePose = function (spec, pose, alpha) {
      const d = sc.setDie(spec);
      d.pos = { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z }; d.q = pose.q; d.track = null; d.glide = null;
      if (alpha != null) d.alpha = alpha;
      return d;
    };
    sc.glide = function (id, x, z, yaw, ms, lift) {
      const d = sc.getDie(id); if (!d) return;
      if (d.track) { const L = (d.track.n - 1) * 8, fr = d.track.fr; d.pos = { x: fr[L], y: fr[L + 1], z: fr[L + 2] }; d.q = { w: fr[L + 3], x: fr[L + 4], y: fr[L + 5], z: fr[L + 6] }; d.track = null; }
      d.glide = { from: { x: d.pos.x, y: d.pos.y, z: d.pos.z, q: d.q }, to: { x, y: d.size / 2, z, q: qmul(qYaw(yaw || 0), Q_UP[d.value]) },
        t0: sc.time, dur: sc.calm ? 1 : ms, lift: lift == null ? 0.9 : lift };
      sc.wake();
    };
    sc.upValue = id => { const d = sc.getDie(id); return d ? upValue(d.q) : null; };
    sc.shatter = function (id, color) {
      const d = sc.getDie(id); if (!d) return;
      const c = d.mat.base, R = Math.random, p = d.pos, s = d.size;
      if (!sc.calm) {
        for (let i = 0; i < 26; i++) {
          const a = R() * Math.PI * 2, sp = 2 + R() * 5;
          sc.parts.push({ k: 'shard', x: p.x + (R() - 0.5) * s * 0.6, y: p.y + (R() - 0.3) * s * 0.5, z: p.z + (R() - 0.5) * s * 0.6,
            vx: Math.cos(a) * sp, vy: 3 + R() * 6, vz: Math.sin(a) * sp, rot: R() * 6, vr: (R() - 0.5) * 18, sz: s * (0.12 + R() * 0.2),
            col: i % 5 === 0 ? d.mat.pip : c, life: 1.1 + R() * 0.5, max: 1.6 });
        }
        sc.flash(p.x, p.y, p.z, color || [1, 0.45, 0.4], 2.4);
        sc.ring(p.x, p.z, color || [1, 0.5, 0.45], 2.2);
      }
      sc.removeDie(id);
    };

    /* ---------- cups ---------- */
    sc.setCup = function (o) {
      let c = sc.cups.find(k => k.id === o.id);
      if (!c) { c = { id: o.id, x: 0, y: 0, z: 0, tx: 0, tz: 0, r: 1.6, h: 2.3, alpha: 1, band: [0.2, 0.9, 1], jx: 0, jy: 0, jz: 0, jtx: 0, jtz: 0, label: '' }; sc.cups.push(c); }
      Object.assign(c, o); sc.wake(); return c;
    };
    sc.getCup = id => sc.cups.find(c => c.id === id);
    sc.cupTo = function (id, to, ms, o) {
      const c = sc.getCup(id); if (!c) return;
      o = o || {};
      const from = { x: c.x, y: c.y, z: c.z, tx: c.tx, tz: c.tz };
      const arc = o.arc || 0;
      if (sc.calm) { Object.assign(c, to); return; }
      sc.tween(ms, p => {
        for (const k in to) c[k] = from[k] + (to[k] - from[k]) * p;
        if (arc && to.y == null) c.y = from.y + arc * 4 * p * (1 - p);
      }, { ease: o.ease || 'inOut', delay: o.delay || 0 });
    };
    sc.cupShake = function (id, ms, amp) {
      const c = sc.getCup(id); if (!c || sc.calm) return;
      c.shake = { t0: sc.time, dur: ms, amp: amp || 1 }; sc.wake();
    };

    /* ---------- camera + fx ---------- */
    sc.camTo = function (z, wx, wy, wz) {
      if (sc.calm) return;
      const p = proj(wx || 0, wy || 0, wz || 0);
      sc.camT = { z, x: VW / 2 + (p.x - VW / 2) * Math.min(1, (z - 1) * 3), y: VH / 2 + (p.y - VH / 2) * Math.min(1, (z - 1) * 3) }; sc.wake();
    };
    sc.camReset = function () { sc.camT = { z: 1, x: VW / 2, y: VH / 2 }; sc.wake(); };
    sc.shake = function (a) { if (!sc.calm) { sc.shakeAmt = Math.max(sc.shakeAmt, a); sc.wake(); } };
    sc.burst = function (x, y, z, cols, n, o) {
      if (sc.calm) return; o = o || {};
      const R = Math.random;
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, e = R() * 1.2 + 0.2, sp = (o.speed || 5) * (0.5 + R());
        sc.parts.push({ k: 'spark', x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp * 1.4 + 2, vz: Math.sin(a) * Math.cos(e) * sp,
          col: cols[i % cols.length], life: 0.8 + R() * 0.9, max: 1.7, sz: 0.05 + R() * 0.07 });
      }
      sc.wake();
    };
    sc.flash = function (x, y, z, col, r) { if (!sc.calm) { sc.parts.push({ k: 'flash', x, y, z, col, r, life: 0.35, max: 0.35 }); sc.wake(); } };
    sc.ring = function (x, z, col, r) { if (!sc.calm) { sc.parts.push({ k: 'ring', x, z, col, r, life: 0.55, max: 0.55 }); sc.wake(); } };
    sc.puff = function (x, z, r) { if (!sc.calm) { sc.parts.push({ k: 'puff', x, z, r, life: 0.7, max: 0.7 }); sc.wake(); } };

    /* ---------- busy / remaining ---------- */
    function busy() {
      if (sc.tweens.length || sc.parts.length) return true;
      if (sc.shakeAmt > 0.05) return true;
      const c = sc.cam, t = sc.camT;
      if (Math.abs(c.z - t.z) > 0.0015 || Math.abs(c.x - t.x) > 0.3 || Math.abs(c.y - t.y) > 0.3) return true;
      for (const d of sc.dice) if (d.track || d.glide || d.fade) return true;
      for (const c2 of sc.cups) if (c2.shake) return true;
      return false;
    }
    sc.busy = busy;
    sc.remaining = function () {
      let ms = 0;
      sc.tweens.forEach(t => { ms = Math.max(ms, t.t0 + t.dur - sc.time); });
      sc.dice.forEach(d => {
        if (d.track) ms = Math.max(ms, (d.track.n - 1 - d.track.f) / 60 * 1000);
        if (d.glide) ms = Math.max(ms, d.glide.t0 + d.glide.dur - sc.time);
        if (d.fade) ms = Math.max(ms, d.fade.t0 + d.fade.dur - sc.time);
      });
      return Math.max(0, ms / (sc.timeScale || 1));
    };

    /* ---------- per-frame simulation (cosmetic) ---------- */
    function sampleTrack(d) {
      const tr = d.track, f = Math.min(tr.f, tr.n - 1), i0 = Math.floor(f), i1 = Math.min(tr.n - 1, i0 + 1), t = f - i0;
      const a = i0 * 8, b = i1 * 8, fr = tr.fr;
      d.pos.x = fr[a] + (fr[b] - fr[a]) * t; d.pos.y = fr[a + 1] + (fr[b + 1] - fr[a + 1]) * t; d.pos.z = fr[a + 2] + (fr[b + 2] - fr[a + 2]) * t;
      const qa = { w: fr[a + 3], x: fr[a + 4], y: fr[a + 5], z: fr[a + 6] };
      d.q = t > 0 ? qlerp(qa, { w: fr[b + 3], x: fr[b + 4], y: fr[b + 5], z: fr[b + 6] }, t) : qa;
    }
    function step(realDt) {
      const dt = realDt * sc.timeScale;
      sc.time += dt;
      // timeline (callbacks may add tweens)
      const list = sc.tweens.slice();
      for (const tw of list) {
        if (sc.time < tw.t0) continue;
        const p = tw.dur ? clamp((sc.time - tw.t0) / tw.dur, 0, 1) : 1;
        try { tw.fn(tw.ease ? tw.ease(p) : p, p); } catch (e) { console.error(e); }
        if (p >= 1) { const i = sc.tweens.indexOf(tw); if (i >= 0) sc.tweens.splice(i, 1); }
      }
      for (const d of sc.dice.slice()) {
        if (d.track) {
          const tr = d.track;
          tr.f += dt * 60 / 1000;
          while (tr.hi < tr.hits.length && tr.hits[tr.hi][0] <= tr.f) { const hs = tr.hits[tr.hi++][1]; if (sc.onHit) try { sc.onHit(hs, d); } catch (e) {} }
          sampleTrack(d);
          if (tr.f >= tr.n - 1) d.track = null;
        }
        if (d.glide) {
          const G = d.glide, p = clamp((sc.time - G.t0) / G.dur, 0, 1), e = easeInOut(p);
          d.pos.x = G.from.x + (G.to.x - G.from.x) * e; d.pos.z = G.from.z + (G.to.z - G.from.z) * e;
          d.pos.y = G.from.y + (G.to.y - G.from.y) * e + G.lift * 4 * e * (1 - e);
          d.q = qlerp(G.from.q, G.to.q, e);
          if (p >= 1) d.glide = null;
        }
        if (d.fade) {
          const f = d.fade, p = clamp((sc.time - f.t0) / f.dur, 0, 1);
          d.alpha = f.from + (f.to - f.from) * p;
          if (p >= 1) { d.fade = null; if (f.remove) sc.removeDie(d.id); }
        }
      }
      for (const c of sc.cups) {
        if (c.shake) {
          const s = c.shake, p = (sc.time - s.t0) / s.dur;
          if (p >= 1) { c.shake = null; c.jx = c.jy = c.jz = c.jtx = c.jtz = 0; }
          else {
            const env = Math.sin(Math.min(1, p * 5) * Math.PI / 2) * s.amp, ph = sc.time * 0.045;
            c.jx = Math.sin(ph * 1.9) * 0.28 * env; c.jz = Math.cos(ph * 1.4) * 0.18 * env;
            c.jy = (0.55 + Math.abs(Math.sin(ph * 1.7)) * 0.5) * env;
            c.jtx = Math.sin(ph * 2.3) * 0.22 * env; c.jtz = Math.cos(ph * 2.1) * 0.26 * env;
          }
        }
      }
      // particles (world units, seconds)
      const s = dt / 1000;
      sc.parts = sc.parts.filter(q => {
        q.life -= s;
        if (q.k === 'spark' || q.k === 'shard') {
          q.vy -= (q.k === 'shard' ? 30 : 9) * s; q.x += q.vx * s; q.y += q.vy * s; q.z += q.vz * s;
          if (q.k === 'shard') { q.rot += q.vr * s; if (q.y < q.sz * 0.3) { q.y = q.sz * 0.3; q.vy = -q.vy * 0.3; q.vx *= 0.7; q.vz *= 0.7; q.vr *= 0.6; } }
          else { q.vx *= 1 - 1.2 * s; q.vz *= 1 - 1.2 * s; }
        }
        return q.life > 0;
      });
      // camera
      const c = sc.cam, t = sc.camT, r = 1 - Math.pow(1 - sc.camRate, realDt / 16.7);
      c.z += (t.z - c.z) * r; c.x += (t.x - c.x) * r; c.y += (t.y - c.y) * r;
      sc.shakeAmt *= Math.pow(0.86, realDt / 16.7); if (sc.shakeAmt < 0.05) sc.shakeAmt = 0;
      sc.sx = sc.shakeAmt ? (Math.random() * 2 - 1) * sc.shakeAmt : 0; sc.sy = sc.shakeAmt ? (Math.random() * 2 - 1) * sc.shakeAmt : 0;
      // dust in the lamp light
      const ms = realDt / 1000;
      sc.motes.forEach(m => {
        m.x += (m.vx + Math.sin(sc.time * 0.0004 + m.ph) * 4) * ms; m.y += m.vy * ms;
        if (m.y < m.y0 - 160) m.y = m.y0 + 60; if (m.x < 60) m.x = VW - 60; if (m.x > VW - 60) m.x = 60;
      });
    }

    /* ---------- drawing helpers ---------- */
    const rgbS = (r, g, b) => `rgb(${clamp(r * 255, 0, 255) | 0},${clamp(g * 255, 0, 255) | 0},${clamp(b * 255, 0, 255) | 0})`;
    const rgbaS = (c, a) => `rgba(${clamp(c[0] * 255, 0, 255) | 0},${clamp(c[1] * 255, 0, 255) | 0},${clamp(c[2] * 255, 0, 255) | 0},${a})`;
    const FELT = T.felt;
    // Lighting at world point p with normal n for albedo col → [r,g,b]
    function light(col, nx, ny, nz, px, py, pz, spec, shin, aoH, out) {
      let lx = LP.x - px, ly = LP.y - py, lz = LP.z - pz; const ll = SQ(lx * lx + ly * ly + lz * lz); lx /= ll; ly /= ll; lz /= ll;
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const ndf = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
      const bounce = ny < 0 ? -ny : 0;
      let vx = E.x - px, vy = E.y - py, vz = E.z - pz; const vl = SQ(vx * vx + vy * vy + vz * vz); vx /= vl; vy /= vl; vz /= vl;
      let hx = lx + vx, hy = ly + vy, hz = lz + vz; const hl = SQ(hx * hx + hy * hy + hz * hz) || 1;
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
      const sp = ndl > 0 ? Math.pow(ndh, shin) * spec : 0;
      const ao = aoH ? 0.6 + 0.4 * clamp(py / aoH, 0, 1) : 1;
      const rim = Math.pow(1 - Math.max(0, nx * vx + ny * vy + nz * vz), 3) * 0.12;
      out[0] = (col[0] * (0.2 + ndl * 0.95 * 1.0 + ndf * 0.26 * 0.62 + bounce * FELT[0] * 0.9) + rim * 0.5) * ao + sp;
      out[1] = (col[1] * (0.2 + ndl * 0.95 * 0.9 + ndf * 0.26 * 0.78 + bounce * FELT[1] * 0.9) + rim * 0.6) * ao + sp * 0.95;
      out[2] = (col[2] * (0.22 + ndl * 0.95 * 0.76 + ndf * 0.26 * 1.0 + bounce * FELT[2] * 0.9) + rim * 0.8) * ao + sp * 0.85;
      return out;
    }
    const LC = [0, 0, 0], LC2 = [0, 0, 0];
    function camMatrix(g) {
      const k = sc.k, c = sc.cam, z = c.z;
      g.setTransform(k * z, 0, 0, k * z, k * (VW / 2 - z * c.x + sc.sx), k * (VH / 2 - z * c.y + sc.sy));
    }
    // affine map of the table plane at (x, y, z): 1 local unit = `unit` world units along +x / +z
    sc.plane = function (g, x, z, unit, y) {
      unit = unit || 0.01; y = y || 0;
      const p0 = proj(x, y, z), px = proj(x + 0.5, y, z), pz = proj(x, y, z + 0.5);
      const a = (px.x - p0.x) * 2 * unit, b = (px.y - p0.y) * 2 * unit, c = (pz.x - p0.x) * 2 * unit, d = (pz.y - p0.y) * 2 * unit;
      g.transform(a, b, c, d, p0.x, p0.y);
    };
    function hull(xs, ys, n) {
      const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i;
      idx.sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
      const cr = (o, a, b) => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
      const lo = [], up = [];
      for (const i of idx) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
      for (let j = idx.length - 1; j >= 0; j--) { const i = idx[j]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], i) <= 0) up.pop(); up.push(i); }
      lo.pop(); up.pop();
      return lo.concat(up);
    }
    // sprites
    const sprites = {};
    function shadowSprite(soft) {
      const key = soft ? 'shS' : 'shH'; if (sprites[key]) return sprites[key];
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = soft ? 22 : 8; g.shadowOffsetX = 1000;
      g.fillStyle = '#000'; const r = soft ? 30 : 34, cx = 64 - 1000;
      g.beginPath(); g.roundRect ? g.roundRect(cx - r, 64 - r, r * 2, r * 2, r * 0.3) : g.rect(cx - r, 64 - r, r * 2, r * 2); g.fill();
      return (sprites[key] = c);
    }
    function sparkSprite(col) {
      const key = 's' + col.join(','); if (sprites[key]) return sprites[key];
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(0.18, rgbaS(col, 0.95)); gr.addColorStop(0.45, rgbaS(col, 0.22)); gr.addColorStop(1, rgbaS(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return (sprites[key] = c);
    }
    function glowSprite(col) {
      const key = 'g' + col.join(','); if (sprites[key]) return sprites[key];
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgbaS(col, 0.9)); gr.addColorStop(0.35, rgbaS(col, 0.35)); gr.addColorStop(1, rgbaS(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return (sprites[key] = c);
    }

    /* ---------- the static table layer ---------- */
    function ring(hx, hz, rc, y, seg) {
      const pts = [], cs = [[hx - rc, hz - rc, 0], [-(hx - rc), hz - rc, 1], [-(hx - rc), -(hz - rc), 2], [hx - rc, -(hz - rc), 3]];
      cs.forEach(([cx, cz, k]) => {
        for (let s = 0; s <= seg; s++) {
          const a = (k + s / seg) * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
          pts.push({ x: cx + rc * ca, y, z: cz + rc * sa, nx: ca, nz: sa });
        }
      });
      return pts;
    }
    function pathPts(g, pts) { g.beginPath(); pts.forEach((p, i) => { const q = proj(p.x, p.y, p.z); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }); g.closePath(); }
    function buildLayer() {
      const c = document.createElement('canvas'); c.width = sc.W; c.height = sc.H;
      const b = c.getContext('2d'), k = sc.k;
      b.setTransform(k, 0, 0, k, 0, 0);
      // the room: a dark bar, warm haze under the lamp, out-of-focus lights
      const bg = b.createLinearGradient(0, 0, 0, VH); bg.addColorStop(0, '#0b0710'); bg.addColorStop(0.5, '#08060c'); bg.addColorStop(1, '#040306');
      b.fillStyle = bg; b.fillRect(0, 0, VW, VH);
      const R = rng(hash('bokeh' + sc.tag));
      const cols = [[1, 0.62, 0.3], [1, 0.45, 0.6], [0.35, 0.8, 1], [1, 0.78, 0.45]];
      for (let i = 0; i < 16; i++) {
        const x = R() * VW, y = R() * VH * 0.32, r = 14 + R() * 40, col = cols[i % 4], a = 0.05 + R() * 0.09;
        const gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgbaS(col, a)); gr.addColorStop(0.75, rgbaS(col, a * 0.7)); gr.addColorStop(1, rgbaS(col, 0));
        b.fillStyle = gr; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
      }
      const lampP = proj(LP.x * 0.3, 0, 0);
      const haze = b.createRadialGradient(lampP.x, 0, 10, lampP.x, 0, VW * 0.6);
      haze.addColorStop(0, 'rgba(255,190,120,.16)'); haze.addColorStop(1, 'rgba(255,190,120,0)');
      b.fillStyle = haze; b.fillRect(0, 0, VW, VH);

      const NB = 11, seg = 9, RW = T.rail, RH = T.railH;
      const prof = j => RH * (0.58 + 0.42 * Math.sin(Math.PI * (0.08 + 0.86 * j / NB)));   // a padded, rounded bumper
      const rings = []; for (let j = 0; j <= NB; j++) rings.push(ring(T.hx + RW * j / NB, T.hz + RW * j / NB, T.rc + RW * j / NB, prof(j), seg));
      const bottom = ring(T.hx + RW, T.hz + RW, T.rc + RW, -1.4, seg);
      const feltEdge = ring(T.hx, T.hz, T.rc, 0, seg);
      const inner0 = rings[0];
      // felt
      pathPts(b, feltEdge);
      const fp = proj(0, 0, 0);
      const fg = b.createRadialGradient(fp.x, fp.y - VH * 0.06, 10, fp.x, fp.y, VW * 0.62);
      const f = FELT;
      fg.addColorStop(0, rgbS(f[0] * 1.9, f[1] * 1.75, f[2] * 1.7)); fg.addColorStop(0.55, rgbS(f[0] * 1.15, f[1] * 1.1, f[2] * 1.1)); fg.addColorStop(1, rgbS(f[0] * 0.45, f[1] * 0.45, f[2] * 0.5));
      b.fillStyle = fg; b.fill();
      b.save(); pathPts(b, feltEdge); b.clip();
      // cloth grain
      const nz = document.createElement('canvas'); nz.width = nz.height = 96; const ng = nz.getContext('2d'); const img = ng.createImageData(96, 96);
      for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      ng.putImageData(img, 0, 0);
      b.globalAlpha = 0.07; b.globalCompositeOperation = 'overlay';
      b.setTransform(1, 0, 0, 1, 0, 0); b.fillStyle = b.createPattern(nz, 'repeat'); b.fillRect(0, 0, sc.W, sc.H);
      b.setTransform(k, 0, 0, k, 0, 0); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
      // lamp pool
      const lp = proj(LP.x * 0.45, 0, LP.z * 0.45 + 0.2);
      const pool = b.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, VW * 0.42);
      pool.addColorStop(0, 'rgba(255,214,150,.20)'); pool.addColorStop(0.5, 'rgba(255,196,130,.07)'); pool.addColorStop(1, 'rgba(255,196,130,0)');
      b.fillStyle = pool; b.fillRect(0, 0, VW, VH);
      // logo on the cloth
      if (T.logo) {
        b.save(); sc.plane(b, 0, T.logoZ || 0, 0.01);
        b.strokeStyle = 'rgba(255,214,120,.16)'; b.lineWidth = 3;
        b.beginPath(); b.ellipse(0, 0, 210, 120, 0, 0, 7); b.stroke();
        b.strokeStyle = 'rgba(255,214,120,.09)'; b.lineWidth = 1.5; b.beginPath(); b.ellipse(0, 0, 196, 106, 0, 0, 7); b.stroke();
        b.fillStyle = 'rgba(255,214,120,.17)'; b.textAlign = 'center'; b.textBaseline = 'middle';
        b.font = '900 72px Orbitron, "Chakra Petch", sans-serif'; b.fillText(T.logo[0], 0, -10);
        b.font = '700 26px Orbitron, "Chakra Petch", sans-serif'; b.fillStyle = 'rgba(255,214,120,.12)'; b.fillText(T.logo[1] || '', 0, 58);
        b.restore();
      }
      // held tray: a stitched leather inset along the near rail
      if (T.tray) {
        const t = T.tray, tr = ring((t.x1 - t.x0) / 2, (t.z1 - t.z0) / 2, 0.32, 0.002, 4).map(p => ({ x: p.x + (t.x0 + t.x1) / 2, y: p.y, z: p.z + (t.z0 + t.z1) / 2 }));
        pathPts(b, tr);
        const a = proj(0, 0, t.z0), bb = proj(0, 0, t.z1);
        const tg = b.createLinearGradient(0, a.y, 0, bb.y); tg.addColorStop(0, '#0b0605'); tg.addColorStop(0.3, '#1d100b'); tg.addColorStop(1, '#2a160f');
        b.fillStyle = tg; b.fill();
        b.strokeStyle = 'rgba(255,205,120,.5)'; b.lineWidth = 1.6; b.stroke();
        b.save(); b.clip();
        b.setLineDash([5, 5]); b.strokeStyle = 'rgba(230,190,140,.28)'; b.lineWidth = 1.1;
        const tr2 = ring((t.x1 - t.x0) / 2 - 0.12, (t.z1 - t.z0) / 2 - 0.12, 0.22, 0.002, 4).map(p => ({ x: p.x + (t.x0 + t.x1) / 2, y: p.y, z: p.z + (t.z0 + t.z1) / 2 }));
        pathPts(b, tr2); b.stroke(); b.setLineDash([]);
        b.restore();
        if (t.label) {
          b.save(); sc.plane(b, t.x0 - 0.02, (t.z0 + t.z1) / 2, 0.01);
          b.rotate(-Math.PI / 2); b.fillStyle = 'rgba(255,214,140,.30)'; b.font = '800 22px Orbitron, sans-serif'; b.textAlign = 'center'; b.textBaseline = 'bottom';
          b.fillText(t.label, 0, -8); b.restore();
        }
      }
      // edge falloff on the cloth
      const vg = b.createRadialGradient(fp.x, fp.y - VH * 0.05, VW * 0.22, fp.x, fp.y, VW * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
      b.fillStyle = vg; b.fillRect(0, 0, VW, VH);
      b.restore();
      // rail: collect quads (inner wall, padded top bands, outer wood skirt), painter-sort, shade
      const quads = [];
      const n = inner0.length;
      const lc = [0, 0, 0];
      const LEATHER = T.leather || [0.17, 0.075, 0.055], WOOD = [0.22, 0.12, 0.065];
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        const mx = (inner0[i].nx + inner0[i2].nx) / 2, mz = (inner0[i].nz + inner0[i2].nz) / 2;
        // inner wall (faces the cloth)
        quads.push({ pts: [feltEdge[i], feltEdge[i2], inner0[i2], inner0[i]], nx: -mx, ny: 0.15, nz: -mz, col: [LEATHER[0] * 0.55, LEATHER[1] * 0.55, LEATHER[2] * 0.55], sp: 0.05 });
        for (let j = 0; j < NB; j++) {
          const A = rings[j], Bq = rings[j + 1];
          const slope = (prof(j + 1) - prof(j)) / (RW / NB);
          let nx = -slope * mx, ny = 1, nz = -slope * mz; const l = SQ(nx * nx + ny * ny + nz * nz);
          quads.push({ pts: [A[i], A[i2], Bq[i2], Bq[i]], nx: nx / l, ny: ny / l, nz: nz / l, col: LEATHER, sp: 0.34, sh: 9 });
        }
        const O = rings[NB];
        quads.push({ pts: [O[i], O[i2], bottom[i2], bottom[i]], nx: mx, ny: 0, nz: mz, col: WOOD, sp: 0.3, wood: true });
      }
      quads.forEach(q => {
        let cx = 0, cy = 0, cz = 0; q.pts.forEach(p => { cx += p.x; cy += p.y; cz += p.z; }); cx /= 4; cy /= 4; cz /= 4;
        q.c = [cx, cy, cz];
        const vx = E.x - cx, vy = E.y - cy, vz = E.z - cz;
        q.vis = q.nx * vx + q.ny * vy + q.nz * vz > 0;
        q.d = vx * vx + vy * vy + vz * vz;
      });
      quads.filter(q => q.vis).sort((a, c2) => c2.d - a.d).forEach(q => {
        light(q.col, q.nx, q.ny, q.nz, q.c[0], q.c[1], q.c[2], q.sp, q.sh || (q.wood ? 30 : 14), 0, lc);
        const s = rgbS(lc[0], lc[1], lc[2]);
        b.beginPath(); q.pts.forEach((p, i) => { const r = proj(p.x, p.y, p.z); i ? b.lineTo(r.x, r.y) : b.moveTo(r.x, r.y); }); b.closePath();
        b.fillStyle = s; b.strokeStyle = s; b.lineWidth = 0.8; b.fill(); b.stroke();
      });
      // wood grain on the skirt + a brass bead where leather meets wood
      b.save(); b.setLineDash([]);
      b.strokeStyle = 'rgba(255,200,120,.35)'; b.lineWidth = 1.3;
      const O = rings[NB];
      b.beginPath(); let started = false;
      O.forEach(p => { if (p.nz <= 0.2) { started = false; return; } const r = proj(p.x, p.y, p.z); started ? b.lineTo(r.x, r.y) : b.moveTo(r.x, r.y); started = true; });
      b.stroke();
      // stitching along the padded top
      [2, NB - 2].forEach(j => {
        b.setLineDash([4, 4]); b.strokeStyle = 'rgba(235,190,150,.34)'; b.lineWidth = 1.1;
        const rg = rings[j].map(p => ({ x: p.x, y: p.y + 0.01, z: p.z }));
        // only the parts facing the camera side of the pad
        b.beginPath(); let on = false;
        rg.forEach(p => { const r = proj(p.x, p.y, p.z); on ? b.lineTo(r.x, r.y) : b.moveTo(r.x, r.y); on = true; });
        b.closePath(); b.stroke();
      });
      b.restore();
      sc.layer = c;
      // dust motes live in the light pool
      if (!sc.motes.length) {
        const R2 = rng(hash('motes' + sc.tag));
        for (let i = 0; i < 26; i++) { const y0 = lp.y - 40 + R2() * 140; sc.motes.push({ x: 80 + R2() * (VW - 160), y: y0 - R2() * 160, y0, vx: (R2() - 0.5) * 6, vy: -(3 + R2() * 7), r: 1.2 + R2() * 2.6, a: 0.12 + R2() * 0.3, ph: R2() * 6 }); }
      }
    }

    /* ---------- dice ---------- */
    const DX = new Float64Array(MESH.nv), DY = new Float64Array(MESH.nv), WX = new Float64Array(MESH.nv), WY = new Float64Array(MESH.nv), WZ = new Float64Array(MESH.nv);
    const PX = new Float64Array(PIP_SEG), PY = new Float64Array(PIP_SEG);
    const GOLD = [1, 0.78, 0.3];
    function tintBase(d) {
      let c = d.mat.base;
      if (d.glow) { const a = d.glow.amt * (d.glow.tint != null ? d.glow.tint : 0.5), g = d.glow.col; c = [c[0] + (g[0] - c[0]) * a, c[1] + (g[1] - c[1]) * a, c[2] + (g[2] - c[2]) * a]; }
      if (d.dim) { const m = 1 - d.dim * 0.6; c = [c[0] * m, c[1] * m, c[2] * m]; }
      return c;
    }
    function drawDie(g, d) {
      if (Dice3D.debugDraw) { try { Dice3D.debugDraw(sc.tag, d); } catch (e) {} }
      const s = d.size / 2 * (d.scale || 1), m = qmat(d.q, M9), P = d.pos, V = MESH.V, nv = MESH.nv;
      for (let i = 0; i < nv; i++) {
        const lx = V[i * 3], ly = V[i * 3 + 1], lz = V[i * 3 + 2];
        const wx = P.x + s * (m[0] * lx + m[1] * ly + m[2] * lz), wy = P.y + s * (m[3] * lx + m[4] * ly + m[5] * lz), wz = P.z + s * (m[6] * lx + m[7] * ly + m[8] * lz);
        WX[i] = wx; WY[i] = wy; WZ[i] = wz;
        projRaw(wx, wy, wz, PT); DX[i] = PT.x; DY[i] = PT.y;
      }
      const base = tintBase(d), mat = d.mat, aoH = d.size * 0.9;
      g.globalAlpha = d.alpha;
      // silhouette underlay (hides hairline seams between facets)
      const hl = hull(DX, DY, nv);
      g.beginPath(); hl.forEach((i, j) => j ? g.lineTo(DX[i], DY[i]) : g.moveTo(DX[i], DY[i])); g.closePath();
      light(base, 0, 0.3, 0.95, P.x, P.y, P.z, 0, 1, aoH, LC);
      g.fillStyle = rgbS(LC[0] * 0.8, LC[1] * 0.8, LC[2] * 0.8); g.fill();
      d._hull = hl.map(i => [DX[i], DY[i]]);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      hl.forEach(i => { if (DX[i] < minx) minx = DX[i]; if (DX[i] > maxx) maxx = DX[i]; if (DY[i] < miny) miny = DY[i]; if (DY[i] > maxy) maxy = DY[i]; });
      d._bb = [minx, miny, maxx, maxy];
      const faceVis = [0, 0, 0, 0, 0, 0];
      g.lineJoin = 'round';
      for (const q of MESH.quads) {
        const nx = m[0] * q.nx + m[1] * q.ny + m[2] * q.nz, ny = m[3] * q.nx + m[4] * q.ny + m[5] * q.nz, nz = m[6] * q.nx + m[7] * q.ny + m[8] * q.nz;
        const cx = P.x + s * (m[0] * q.cx + m[1] * q.cy + m[2] * q.cz), cy = P.y + s * (m[3] * q.cx + m[4] * q.cy + m[5] * q.cz), cz = P.z + s * (m[6] * q.cx + m[7] * q.cy + m[8] * q.cz);
        const vd = nx * (E.x - cx) + ny * (E.y - cy) + nz * (E.z - cz);
        if (vd <= 0) continue;
        g.beginPath(); g.moveTo(DX[q.a], DY[q.a]); g.lineTo(DX[q.b], DY[q.b]); g.lineTo(DX[q.c], DY[q.c]); g.lineTo(DX[q.d], DY[q.d]); g.closePath();
        if (q.flat) {
          faceVis[q.f] = vd;
          // a gentle gradient across the face: the lamp is a point, so light varies corner to corner
          light(base, nx, ny, nz, WX[q.a], WY[q.a], WZ[q.a], mat.spec, mat.shin, aoH, LC);
          light(base, nx, ny, nz, WX[q.c], WY[q.c], WZ[q.c], mat.spec, mat.shin, aoH, LC2);
          const gr = g.createLinearGradient(DX[q.a], DY[q.a], DX[q.c], DY[q.c]);
          gr.addColorStop(0, rgbS(LC[0], LC[1], LC[2])); gr.addColorStop(1, rgbS(LC2[0], LC2[1], LC2[2]));
          g.fillStyle = gr; g.strokeStyle = gr; g.lineWidth = 0.9; g.fill(); g.stroke();
        } else {
          light(base, nx, ny, nz, cx, cy, cz, mat.spec, mat.shin, aoH, LC);
          const st = rgbS(LC[0], LC[1], LC[2]);
          g.fillStyle = st; g.strokeStyle = st; g.lineWidth = 0.9; g.fill(); g.stroke();
        }
      }
      // pips: a recessed disc — the wall nearest the lamp falls into shadow
      const iq = { w: d.q.w, x: -d.q.x, y: -d.q.y, z: -d.q.z }, im = qmat(iq, IM9);
      let lx = LP.x - P.x, ly = LP.y - P.y, lz = LP.z - P.z; const ll = SQ(lx * lx + ly * ly + lz * lz); lx /= ll; ly /= ll; lz /= ll;
      const Lx = im[0] * lx + im[1] * ly + im[2] * lz, Ly = im[3] * lx + im[4] * ly + im[5] * lz, Lz = im[6] * lx + im[7] * ly + im[8] * lz;
      const pipCol = d.glow && d.glow.pip ? d.glow.pip : mat.pip;
      for (let f = 0; f < 6; f++) {
        if (faceVis[f] <= 0) continue;
        const F2 = FACES[f];
        const wnx = m[0] * F2.n[0] + m[1] * F2.n[1] + m[2] * F2.n[2], wny = m[3] * F2.n[0] + m[4] * F2.n[1] + m[5] * F2.n[2], wnz = m[6] * F2.n[0] + m[7] * F2.n[1] + m[8] * F2.n[2];
        // light direction in the face plane (local)
        const ln = Lx * F2.n[0] + Ly * F2.n[1] + Lz * F2.n[2];
        let ox = Lx - ln * F2.n[0], oy = Ly - ln * F2.n[1], oz = Lz - ln * F2.n[2]; const ol = SQ(ox * ox + oy * oy + oz * oz) || 1;
        const off = 0.055; ox = -ox / ol * off; oy = -oy / ol * off; oz = -oz / ol * off;
        const fcx = P.x + s * wnx, fcy = P.y + s * wny, fcz = P.z + s * wnz;
        light(pipCol, wnx, wny, wnz, fcx, fcy, fcz, 0.05, 8, aoH, LC);
        const pipS = rgbS(LC[0], LC[1], LC[2]);
        const dark = pipCol[0] + pipCol[1] + pipCol[2] < 1.5;
        const shS = dark ? rgbS(LC[0] * 0.25, LC[1] * 0.25, LC[2] * 0.3) : rgbS(LC[0] * 0.42, LC[1] * 0.42, LC[2] * 0.48);
        for (const pip of MESH.pips[f]) {
          // the whole dimple, in shadow (the wall nearest the lamp stays dark) …
          polyPip(g, pip.pts, P, s, m, 0, 0, 0, 1);
          g.fillStyle = shS; g.fill();
          // … and its lit floor, shifted away from the lamp
          polyPip(g, pip.pts, P, s, m, ox, oy, oz, 0.82, pip);
          g.fillStyle = pipS; g.fill();
        }
      }
      // neon rim for held / highlighted dice
      if (d.rim) {
        g.save(); g.globalCompositeOperation = 'lighter';
        g.beginPath(); hl.forEach((i, j) => j ? g.lineTo(DX[i], DY[i]) : g.moveTo(DX[i], DY[i])); g.closePath();
        g.strokeStyle = rgbaS(d.rim.col, 0.9 * d.rim.amt * d.alpha); g.lineWidth = 2.6; g.stroke();
        g.strokeStyle = rgbaS(d.rim.col, 0.3 * d.rim.amt * d.alpha); g.lineWidth = 7; g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    }
    const IM9 = new Array(9);
    function polyPip(g, pts, P, s, m, ox, oy, oz, shrink, pip) {
      g.beginPath();
      for (let k = 0; k < PIP_SEG; k++) {
        let lx = pts[k * 3], ly = pts[k * 3 + 1], lz = pts[k * 3 + 2];
        if (pip) { lx = pip.cx + (lx - pip.cx) * shrink + ox; ly = pip.cy + (ly - pip.cy) * shrink + oy; lz = pip.cz + (lz - pip.cz) * shrink + oz; }
        const wx = P.x + s * (m[0] * lx + m[1] * ly + m[2] * lz), wy = P.y + s * (m[3] * lx + m[4] * ly + m[5] * lz), wz = P.z + s * (m[6] * lx + m[7] * ly + m[8] * lz);
        projRaw(wx, wy, wz, PT);
        k ? g.lineTo(PT.x, PT.y) : g.moveTo(PT.x, PT.y);
      }
      g.closePath();
    }
    function drawShadowAt(g, x, z, yawX, yawZ, half, h, alpha) {
      // project the object's centre along the lamp ray onto the cloth
      const t = h / Math.max(0.5, LP.y - h);
      const sx = x + (x - LP.x) * t * 0.9, sz = z + (z - LP.z) * t * 0.9;
      const soft = shadowSprite(true), hard = shadowSprite(false);
      const spread = half * (1 + h * 0.22);
      g.save(); sc.plane(g, sx, sz, 1); g.transform(yawX, yawZ, -yawZ, yawX, 0, 0);
      g.globalAlpha = alpha * clamp(0.62 / (1 + h * 0.55), 0, 1);
      g.drawImage(soft, -spread * 2.1, -spread * 2.1, spread * 4.2, spread * 4.2);
      const contact = clamp(1 - h * 2.5, 0, 1);
      if (contact > 0) { g.globalAlpha = alpha * 0.55 * contact; g.drawImage(hard, -half * 1.95, -half * 1.95, half * 3.9, half * 3.9); }
      g.restore();
    }
    function drawCup(g, c) {
      const x = c.x + c.jx, y = c.y + c.jy, z = c.z + c.jz, tx = c.tx + c.jtx, tz = c.tz + c.jtz;
      // up axis tilted: about X by tx (top toward −z when tx>0), about Z by tz
      let ux = -Math.sin(tz), uy = Math.cos(tx) * Math.cos(tz), uz = -Math.sin(tx) * Math.cos(tz);
      { const l = SQ(ux * ux + uy * uy + uz * uz); ux /= l; uy /= l; uz /= l; }
      let e1x = uy, e1y = -ux; const e1z = 0;                          // u × ẑ
      { const l = SQ(e1x * e1x + e1y * e1y) || 1; e1x /= l; e1y /= l; }
      const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
      const N = 48, r0 = c.r, r1 = c.r * 0.86, H = c.h;
      const ringAt = (t, rad) => {
        const out = [];
        const cx = x + ux * H * t, cy = y + uy * H * t, cz = z + uz * H * t;
        for (let i = 0; i < N; i++) {
          const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const nx = e1x * ca + e2x * sa, ny = e1y * ca + e2y * sa, nz = e1z * ca + e2z * sa;
          const wx = cx + nx * rad, wy = cy + ny * rad, wz = cz + nz * rad;
          const p = proj(wx, wy, wz);
          out.push({ x: p.x, y: p.y, wx, wy, wz, nx, ny, nz, vis: nx * (E.x - wx) + ny * (E.y - wy) + nz * (E.z - wz) > 0 });
        }
        return out;
      };
      const R0 = ringAt(0, r0), R1 = ringAt(1, r1);
      g.globalAlpha = c.alpha;
      // silhouette
      const xs = [], ys = []; R0.concat(R1).forEach(p => { xs.push(p.x); ys.push(p.y); });
      const hl = hull(xs, ys, xs.length);
      const silhouette = () => { g.beginPath(); hl.forEach((i, j) => j ? g.lineTo(xs[i], ys[i]) : g.moveTo(xs[i], ys[i])); g.closePath(); };
      const LEATH = c.leather || [0.2, 0.1, 0.07], BR = [0.86, 0.63, 0.3];
      const taper = (r0 - r1) / H;
      // smooth shading: sample the lamp across the visible side and lay it down as one gradient
      const a0 = proj(x, y, z), a1 = proj(x + ux * H, y + uy * H, z + uz * H);
      let px = -(a1.y - a0.y), py = a1.x - a0.x; { const l = Math.hypot(px, py) || 1; px /= l; py /= l; }
      let sMin = 1e9, sMax = -1e9;
      hl.forEach(i => { const sv = (xs[i] - a0.x) * px + (ys[i] - a0.y) * py; if (sv < sMin) sMin = sv; if (sv > sMax) sMax = sv; });
      const span = Math.max(1e-3, sMax - sMin);
      const shadeAcross = (col, spc, sh, t) => {
        const rad = r0 + (r1 - r0) * t, cx = x + ux * H * t, cy = y + uy * H * t, cz = z + uz * H * t, stops = [];
        for (let i = 0; i < 36; i++) {
          const a = i / 36 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const fx = e1x * ca + e2x * sa, fy = e1y * ca + e2y * sa, fz = e1z * ca + e2z * sa;
          const wx = cx + fx * rad, wy = cy + fy * rad, wz = cz + fz * rad;
          let nx = fx + ux * taper, ny = fy + uy * taper, nz = fz + uz * taper; const l = SQ(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
          if (nx * (E.x - wx) + ny * (E.y - wy) + nz * (E.z - wz) <= 0) continue;
          light(col, nx, ny, nz, wx, wy, wz, spc, sh, 0, LC);
          projRaw(wx, wy, wz, PT);
          stops.push([clamp(((PT.x - a0.x) * px + (PT.y - a0.y) * py - sMin) / span, 0, 1), rgbS(LC[0], LC[1], LC[2])]);
        }
        const gr = g.createLinearGradient(a0.x + px * sMin, a0.y + py * sMin, a0.x + px * sMax, a0.y + py * sMax);
        stops.sort((p1, p2) => p1[0] - p2[0]).forEach(st => gr.addColorStop(st[0], st[1]));
        return stops.length ? gr : '#1a0d09';
      };
      silhouette(); g.fillStyle = shadeAcross(LEATH, 0.28, 12, 0.55); g.fill();
      // trim bands: the visible front arc of two rings, joined
      const bandPoly = (t0, t1) => {
        const A = ringAt(t0, r0 + (r1 - r0) * t0), B = ringAt(t1, r0 + (r1 - r0) * t1);
        let st0 = -1; for (let i = 0; i < N; i++) if (A[i].vis && !A[(i + N - 1) % N].vis) { st0 = i; break; }
        const arc = []; if (st0 < 0) { if (!A[0].vis) return false; for (let i = 0; i < N; i++) arc.push(i); } else for (let k = 0; k < N; k++) { const i = (st0 + k) % N; if (!A[i].vis) break; arc.push(i); }
        if (arc.length < 2) return false;
        arc.unshift((arc[0] + N - 1) % N); arc.push((arc[arc.length - 1] + 1) % N);   // reach the silhouette
        g.beginPath(); arc.forEach((i, k) => k ? g.lineTo(A[i].x, A[i].y) : g.moveTo(A[i].x, A[i].y));
        for (let k = arc.length - 1; k >= 0; k--) g.lineTo(B[arc[k]].x, B[arc[k]].y);
        g.closePath(); return true;
      };
      g.save(); silhouette(); g.clip();
      [[0, 0.075, BR, 0.9, 40], [0.19, 0.28, c.band, 0.55, 26], [0.925, 1, BR, 0.9, 40]].forEach(([t0, t1, col, spc, sh]) => {
        if (bandPoly(t0, t1)) { g.fillStyle = shadeAcross(col, spc, sh, (t0 + t1) / 2); g.fill(); }
      });
      // stitching above and below the colour band
      [0.165, 0.305].forEach(t => {
        const A = ringAt(t, r0 + (r1 - r0) * t);
        g.beginPath(); let on = false; A.forEach(p => { if (!p.vis) { on = false; return; } on ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); on = true; });
        g.setLineDash([3, 3]); g.strokeStyle = 'rgba(240,205,160,.35)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
      });
      g.restore();
      // closed top (the cup is mouth-down)
      const tcx = x + ux * H, tcy = y + uy * H, tcz = z + uz * H;
      if (ux * (E.x - tcx) + uy * (E.y - tcy) + uz * (E.z - tcz) > 0) {
        g.beginPath(); R1.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
        light(LEATH, ux, uy, uz, tcx, tcy, tcz, 0.25, 10, 0, LC);
        const cp = proj(tcx, tcy, tcz);
        const gr = g.createRadialGradient(cp.x - 12, cp.y - 6, 2, cp.x, cp.y, Math.abs(R1[0].x - cp.x) * 1.2 + 20);
        gr.addColorStop(0, rgbS(LC[0] * 1.35, LC[1] * 1.3, LC[2] * 1.25)); gr.addColorStop(1, rgbS(LC[0] * 0.8, LC[1] * 0.8, LC[2] * 0.8));
        g.fillStyle = gr; g.fill();
        // stitched ring + monogram on the lid
        const inner = [];
        for (let i = 0; i < N; i++) { const p = R1[i]; inner.push(proj(tcx + (p.wx - tcx) * 0.8, tcy + (p.wy - tcy) * 0.8, tcz + (p.wz - tcz) * 0.8)); }
        g.beginPath(); inner.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
        g.setLineDash([3, 3]); g.strokeStyle = 'rgba(240,200,150,.4)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
        if (c.label) {
          const pa = proj(tcx + e1x * 0.5, tcy + e1y * 0.5, tcz + e1z * 0.5), pb = proj(tcx + e2x * 0.5, tcy + e2y * 0.5, tcz + e2z * 0.5);
          g.save(); g.transform((pa.x - cp.x) / 50, (pa.y - cp.y) / 50, (pb.x - cp.x) / 50, (pb.y - cp.y) / 50, cp.x, cp.y);
          g.font = '900 58px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = rgbaS(c.band, 0.85); g.shadowColor = rgbaS(c.band, 0.9); g.shadowBlur = 12;
          g.scale(1, -1); g.fillText(c.label, 0, 2); g.restore();
        }
      } else {
        g.beginPath(); R0.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
        g.fillStyle = '#0a0506'; g.fill();
      }
      c._hull = hl.map(i => [xs[i], ys[i]]);
      g.globalAlpha = 1;
    }

    /* ---------- frame ---------- */
    function draw() {
      const g = sc.g; if (!g) return;
      if (!sc.W) { sc.fit(); if (!sc.W) return; }
      if (!sc.layer) buildLayer();
      const k = sc.k;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#05040a'; g.fillRect(0, 0, sc.W, sc.H);
      camMatrix(g);
      g.drawImage(sc.layer, 0, 0, VW, VH);
      if (sc.onTable) { g.save(); try { sc.onTable(g, sc); } catch (e) { console.error(e); } g.restore(); camMatrix(g); }
      const live = sc.dice.filter(d => !d.hidden && d.alpha > 0.003);
      const cups = sc.cups.filter(c => c.alpha > 0.003);
      // shadows
      live.forEach(d => {
        const m = qmat(d.q, M9); let ax = m[0], az = m[6]; const l = SQ(ax * ax + az * az) || 1;
        drawShadowAt(g, d.pos.x, d.pos.z, ax / l, az / l, d.size / 2, Math.max(0, d.pos.y - d.size / 2), d.alpha);
      });
      cups.forEach(c => drawShadowAt(g, c.x + c.jx, c.z + c.jz, 1, 0, c.r * 0.92, Math.max(0, c.y + c.jy) * 0.8 + 0.3, c.alpha * 0.9));
      // light spilling onto the cloth from glowing dice
      g.save(); g.globalCompositeOperation = 'lighter';
      live.forEach(d => {
        const gl = d.glow || (d.rim ? { col: d.rim.col, amt: d.rim.amt * 0.6 } : null);
        if (!gl || gl.amt < 0.02) return;
        g.save(); sc.plane(g, d.pos.x, d.pos.z, 1);
        g.globalAlpha = Math.min(1, gl.amt) * d.alpha * 0.85; const R = d.size * 1.35;
        g.drawImage(glowSprite(gl.col), -R, -R, R * 2, R * 2); g.restore();
      });
      g.restore();
      // painter's sort: far → near (distance from the eye)
      const objs = [];
      live.forEach(d => objs.push({ d, k: 0, dist: (d.pos.x - E.x) ** 2 + (d.pos.y - E.y) ** 2 + (d.pos.z - E.z) ** 2 }));
      cups.forEach(c => { const cy = c.y + c.jy + c.h * 0.5; objs.push({ c, k: 1, dist: (c.x - E.x) ** 2 + (cy - E.y) ** 2 + (c.z - E.z) ** 2 }); });
      objs.sort((a, b) => b.dist - a.dist);
      objs.forEach(o => { if (o.k) drawCup(g, o.c); else if (!coveredByCup(o.d)) drawDie(g, o.d); });
      drawParts(g);
      g.setTransform(k, 0, 0, k, 0, 0);
      // dust drifting through the lamp light
      g.save(); g.globalCompositeOperation = 'lighter';
      const ms = glowSprite([1, 0.86, 0.66]);
      sc.motes.forEach(m => { const tw = 0.6 + 0.4 * Math.sin(sc.time * 0.0012 + m.ph); g.globalAlpha = m.a * tw; g.drawImage(ms, m.x - m.r * 2, m.y - m.r * 2, m.r * 4, m.r * 4); });
      g.restore();
      if (!sc.vign) { const v = g.createRadialGradient(VW / 2, VH * 0.55, VH * 0.35, VW / 2, VH * 0.55, VW * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)'); sc.vign = v; }
      g.fillStyle = sc.vign; g.fillRect(0, 0, VW, VH);
      if (sc.onOverlay) { g.save(); try { sc.onOverlay(g, sc); } catch (e) { console.error(e); } g.restore(); }
    }
    // a die sitting entirely under a closed cup is never drawn — not even for a frame
    function coveredByCup(d) {
      for (const c of sc.cups) {
        if (c.alpha < 0.5) continue;
        const cy = c.y + c.jy;
        if (cy > d.size * 0.15) continue;
        const dx = d.pos.x - c.x - c.jx, dz = d.pos.z - c.z - c.jz;
        if (dx * dx + dz * dz < (c.r - d.size * 0.3) * (c.r - d.size * 0.3)) return true;
      }
      return false;
    }
    sc.isCovered = coveredByCup;
    function drawParts(g) {
      if (!sc.parts.length) return;
      sc.parts.forEach(q => {
        const a = clamp(q.life / q.max, 0, 1);
        if (q.k === 'shard') {
          const p = proj(q.x, q.y, q.z), r = q.sz * p.s;
          light(q.col, 0, 1, 0, q.x, q.y, q.z, 0.3, 20, 0, LC);
          g.save(); g.translate(p.x, p.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 2);
          g.fillStyle = rgbS(LC[0], LC[1], LC[2]);
          g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.6, r * 0.8); g.lineTo(-r * 0.5, -r * 0.7); g.closePath(); g.fill();
          g.restore();
        } else if (q.k === 'puff') {
          g.save(); sc.plane(g, q.x, q.z, 1);
          const rr = q.r * (0.6 + (1 - a) * 0.8);
          g.globalAlpha = a * 0.35; g.fillStyle = 'rgba(200,190,170,1)';
          g.drawImage(glowSprite([0.8, 0.76, 0.7]), -rr, -rr, rr * 2, rr * 2); g.restore();
        }
      });
      g.save(); g.globalCompositeOperation = 'lighter';
      sc.parts.forEach(q => {
        const a = clamp(q.life / q.max, 0, 1);
        if (q.k === 'spark') {
          const p = proj(q.x, q.y, q.z), r = Math.max(2, q.sz * p.s * 1.9);
          g.globalAlpha = Math.min(1, a * 1.6); g.drawImage(sparkSprite(q.col), p.x - r, p.y - r, r * 2, r * 2);
        } else if (q.k === 'flash') {
          const p = proj(q.x, q.y, q.z), r = q.r * p.s;
          g.globalAlpha = a; g.drawImage(glowSprite(q.col), p.x - r, p.y - r, r * 2, r * 2);
        } else if (q.k === 'ring') {
          g.save(); sc.plane(g, q.x, q.z, 1);
          g.strokeStyle = rgbaS(q.col, a * 0.8); g.lineWidth = 0.08 * a + 0.02;
          g.beginPath(); g.arc(0, 0, q.r * (1 - a * 0.8) + 0.2, 0, 7); g.stroke(); g.restore();
        }
      });
      g.restore(); g.globalAlpha = 1;
    }

    /* ---------- picking ---------- */
    sc.toVirtual = function (clientX, clientY) {
      const r = sc.cv.getBoundingClientRect(), vx = (clientX - r.left) / r.width * VW, vy = (clientY - r.top) / r.height * VH;
      const c = sc.cam; return { x: c.x + (vx - VW / 2 - sc.sx) / c.z, y: c.y + (vy - VH / 2 - sc.sy) / c.z };
    };
    sc.hitTest = function (clientX, clientY, filter) {
      if (!sc.cv) return null;
      const p = sc.toVirtual(clientX, clientY);
      let best = null, bs = 1e9;
      sc.dice.forEach(d => {
        if (d.hidden || !d._bb || d.alpha < 0.3 || (filter && !filter(d))) return;
        const [x0, y0, x1, y1] = d._bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(x1 - x0, y1 - y0) / 2;
        const dd = Math.hypot(p.x - cx, p.y - cy) / r;
        if (dd < 1.25 && dd < bs) { bs = dd; best = d.id; }
      });
      return best;
    };
    sc.screenOf = function (id) { const d = sc.getDie(id); if (!d) return null; const p = proj(d.pos.x, d.pos.y, d.pos.z); return p; };
    return sc;
  }

  window.Dice3D = { create, simulate, material, MATS, upValue, hash, rng, Q_UP, qYaw, qmul, FRAMES, debugDraw: null };
})();
