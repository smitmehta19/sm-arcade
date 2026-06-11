/* ============================================================
   DRAW & GUESS — one draws a secret word, the other guesses (online)
   Two-phase (draw → guess) so the two phones never overwrite the sketch.
   ============================================================ */
(function () {
  const css = `
  .dg-canvas{ width:100%; aspect-ratio:4/3; background:#0e0b18; border:1px solid var(--glass-brd); border-radius:14px; touch-action:none; display:block; }
  .dg-prompt{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:24px; letter-spacing:3px; text-transform:uppercase; color:var(--lime); margin:6px 0; }
  .dg-tools{ display:flex; gap:8px; justify-content:center; margin-top:10px; }
  .dg-guess-row{ display:flex; gap:8px; margin-top:10px; }
  .dg-input{ flex:1; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; padding:12px; color:var(--ink); font-size:16px; outline:none; text-transform:uppercase; }
  .dg-list{ margin-top:10px; display:flex; flex-direction:column; gap:5px; }
  .dg-g{ font-size:14px; padding:7px 12px; border-radius:10px; background:var(--panel-2); border:1px solid var(--line); }
  .dg-g.ok{ border-color:var(--lime); color:var(--lime); font-weight:700; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const rint = n => Math.floor(Math.random() * n);
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Single-token clean words split from a string; multi-word + adult prompts added after.
  // Guessing is space/punctuation-insensitive (see norm()), so "doggy style" / "69" all work.
  const DG_CLEAN = ('cat dog fish bird snake lion tiger bear elephant monkey rabbit horse cow pig sheep duck frog owl fox wolf whale shark octopus crab butterfly bee spider snail turtle penguin apple banana pizza cake bread egg cheese burger fries donut icecream cookie carrot grapes lemon strawberry corn mushroom house car boat plane train bike rocket umbrella clock key book pencil scissors hammer ladder chair table lamp phone camera guitar drum bell crown ring glasses hat shoe sock shirt sun moon star cloud rain snow tree flower mountain river fire rainbow leaf cactus volcano island smile sleep dance swim read sing ghost robot alien skull heart anchor sword shield castle bridge tent kite balloon gift candle snowman lighthouse windmill ' +
    // more easy-to-draw additions
    'doughnut ladybug dolphin seahorse jellyfish flamingo peacock dinosaur unicorn dragon mermaid pumpkin pineapple watermelon cherry avocado pepper tomato icecube popsicle lollipop cupcake teapot mug spoon fork knife plate pan kettle toaster fridge bathtub toilet bed pillow couch clock window door stairs fence mailbox swing slide seesaw football basketball tennis bowling dice cards chess crayon brush paint magnet battery lightbulb plug compass map flag trophy medal balloon ribbon party hat sunglasses watch necklace earring lipstick comb mirror razor toothbrush soap bubble feather button zipper needle thread sock mitten scarf boot helmet crown wand broom cauldron coffin bat web spider cobweb').split(' ');
  const DG_ADULT = [
    'dick', 'pussy', 'boobs', 'butt', 'nipple', 'balls', 'condom', 'banana', 'eggplant', 'peach',
    'cucumber', 'sausage', 'cherry', 'kiss', 'hug', 'bra', 'panties', 'thong', 'lingerie', 'handcuffs',
    'whip', 'lipstick', 'bed', 'shower', 'hot tub', 'love bite', 'morning wood', 'blow up doll', 'g spot',
    '69', 'doggy style', 'missionary', 'spooning', 'cowgirl', 'french kiss', 'strip tease', 'twerk',
    'lap dance', 'wet dream', 'one night stand', 'netflix and chill', 'friends with benefits',
    'hot dog in a bun', 'melons', 'peeled banana', 'cream pie', 'cucumber sandwich', 'pearl necklace',
    'birthday suit', 'skinny dip', 'spank', 'tongue', 'wink', 'devil horns', 'horny devil',
  ];
  const DG_PROMPTS = DG_CLEAN.concat(DG_ADULT);

  function drawStrokes(canvas, strokes, extra) {
    const g = canvas.getContext && canvas.getContext('2d'); if (!g) return;   // harness-safe (mock canvas has no context)
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#e9e7f5';
    const all = extra ? strokes.concat([extra]) : strokes;
    for (const st of all) {
      if (!st || !st.length) continue;
      g.beginPath(); g.moveTo(st[0].x * W, st[0].y * H);
      for (let i = 1; i < st.length; i++) g.lineTo(st[i].x * W, st[i].y * H);
      if (st.length === 1) g.lineTo(st[0].x * W + 0.5, st[0].y * H + 0.5);
      g.stroke();
    }
  }

  Games.register({
    id: 'draw-guess', name: 'Draw & Guess', emoji: '🎨', category: 'Couple', accent: '#ff9f45',
    tagline: 'Doodle it, guess it.',
    test: { norm },
    init: host => ({ phase: 'draw', drawer: host, prompt: DG_PROMPTS[rint(DG_PROMPTS.length)], strokes: [], guesses: [], scores: [0, 0], round: 0, rounds: 6, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, drawer = st.drawer, guesser = 1 - drawer;
      ctx.root.append(ctx.h('div', { class: 'score-line' },
        ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ' ' + st.scores[0]), '  –  ',
        ctx.h('span', { style: `color:${ctx.players[1].color}` }, st.scores[1] + ' ' + ctx.players[1].name)));
      ctx.msg(`Round ${st.round + 1} of ${st.rounds}`);
      const frame = ctx.h('div', { class: 'board-frame' }); ctx.root.append(frame);
      const canvas = ctx.h('canvas', { class: 'dg-canvas', width: '600', height: '450' });

      if (st.phase === 'reveal') {
        frame.append(ctx.h('div', { class: 'dg-prompt' }, st.prompt), canvas);
        drawStrokes(canvas, st.strokes);
        const got = st.guesses.some(g => g.ok);
        frame.append(ctx.h('p', { class: 'center', style: 'margin:8px 0;font-weight:700;color:' + (got ? 'var(--lime)' : 'var(--magenta)') }, got ? `${ctx.players[guesser].name} guessed it! +1` : 'Nobody got it 🙈'));
        if (me === st.host) {
          const last = st.round + 1 >= st.rounds;
          ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, last ? 'See result 🏆' : 'Next round ▶'));
        } else waiting(ctx, ctx.players[st.host].name + ' to continue');
        return;
      }

      if (st.phase === 'draw') {
        if (me === drawer) {
          frame.append(ctx.h('div', { class: 'dg-prompt' }, 'Draw: ' + st.prompt), canvas);
          let cur = null;
          const point = e => { const r = canvas.getBoundingClientRect(); const p = (e.touches && e.touches[0]) || e; return { x: Math.max(0, Math.min(1, (p.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (p.clientY - r.top) / r.height)) }; };
          const start = e => { e.preventDefault(); cur = [point(e)]; drawStrokes(canvas, st.strokes, cur); };
          const move = e => { if (!cur) return; e.preventDefault(); cur.push(point(e)); drawStrokes(canvas, st.strokes, cur); };
          const end = () => { if (cur && cur.length) { const s = ctx.clone(st); s.strokes = st.strokes.concat([cur]); ctx.commit(s); } cur = null; };
          canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move);
          canvas.addEventListener('pointerup', end); canvas.addEventListener('pointerleave', end);
          drawStrokes(canvas, st.strokes);
          frame.append(ctx.h('div', { class: 'dg-tools' },
            ctx.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { const s = ctx.clone(st); s.strokes = st.strokes.slice(0, -1); ctx.commit(s); } }, '↶ Undo'),
            ctx.h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { const s = ctx.clone(st); s.strokes = []; ctx.commit(s); } }, '🗑 Clear')));
          ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: () => { const s = ctx.clone(st); s.phase = 'guess'; ctx.commit(s); } }, 'Done — let them guess ▶'));
          ctx.msg('Sketch the word, then hand it over 🎨', ctx.players[me].color);
        } else {
          frame.append(ctx.h('div', { class: 'dg-prompt' }, '✏️ guessing soon…'), canvas);
          drawStrokes(canvas, st.strokes);
          waiting(ctx, ctx.players[drawer].name + ' (drawing)');
        }
        return;
      }

      // phase 'guess' — guesser types, drawer watches; only the guesser commits
      frame.append(canvas); drawStrokes(canvas, st.strokes);
      const list = ctx.h('div', { class: 'dg-list' }, st.guesses.map(g => ctx.h('div', { class: 'dg-g' + (g.ok ? ' ok' : '') }, `${ctx.players[g.by].name}: ${g.text}${g.ok ? ' ✓' : ''}`)));
      if (me === guesser) {
        const inp = ctx.h('input', { class: 'dg-input', placeholder: 'your guess…', maxlength: '24' });
        const submit = () => {
          const text = (inp.value || '').trim(); if (!text) { ctx.sound.bad(); return; }
          const ok = norm(text) === norm(st.prompt);
          const s = ctx.clone(st); s.guesses = st.guesses.concat([{ by: me, text, ok }]);
          if (ok) { s.scores[guesser]++; s.phase = 'reveal'; ctx.sound.good(); } else ctx.sound.bad();
          inp.value = ''; ctx.commit(s);
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        frame.append(ctx.h('div', { class: 'dg-guess-row' }, inp, ctx.h('button', { class: 'btn btn-primary', onclick: submit }, 'Guess')), list);
        ctx.msg('What is it? Type your guess', ctx.players[me].color);
      } else {
        frame.append(list);
        ctx.root.append(ctx.h('button', { class: 'btn btn-ghost btn-block mt', onclick: () => { const s = ctx.clone(st); s.phase = 'reveal'; ctx.commit(s); } }, 'Reveal the answer'));
        waiting(ctx, ctx.players[guesser].name + ' (guessing)');
      }

      function next() {
        const s = ctx.clone(st);
        if (s.round + 1 >= s.rounds) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1));
        s.round++; s.drawer = 1 - s.drawer; s.prompt = DG_PROMPTS[rint(DG_PROMPTS.length)]; s.strokes = []; s.guesses = []; s.phase = 'draw'; ctx.commit(s);
      }
      // `next` is also used by the reveal branch above (hoisted)
      void next;
    },
  });
})();
