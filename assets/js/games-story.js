/* ============================================================
   STORY BUILDER — co-op: take turns adding one sentence to a
   growing story from a random opening prompt. After 6 additions
   either player may call "The End"; at 14 it ends automatically.
   No points — you win together (coop-win), the story is the prize.
   ============================================================ */
(function () {
  const css = `
  .sb-story{ display:flex; flex-direction:column; gap:9px; max-height:44vh; overflow-y:auto; padding:4px 2px; }
  .sb-line{ max-width:88%; padding:10px 14px; border-radius:15px; font-size:14.5px; line-height:1.5; animation:floatUp .3s var(--ease) both; }
  .sb-line.prompt{ align-self:center; max-width:100%; text-align:center; background:rgba(255,214,107,.10); border:1px dashed rgba(255,214,107,.4);
    color:var(--gold); font-style:italic; }
  .sb-line.p0{ align-self:flex-start; background:var(--p1-soft); border:1px solid rgba(47,230,255,.3); border-bottom-left-radius:5px; }
  .sb-line.p1{ align-self:flex-end; background:var(--p2-soft); border:1px solid rgba(255,77,157,.3); border-bottom-right-radius:5px; }
  .sb-line small{ display:block; font-size:10.5px; opacity:.65; margin-bottom:3px; font-weight:700; letter-spacing:.5px; }
  .sb-input{ display:flex; gap:8px; margin-top:14px; }
  .sb-input textarea{ flex:1; background:var(--bg-2); border:1px solid var(--glass-brd); border-radius:13px; padding:11px 13px;
    color:var(--ink); font-family:inherit; font-size:14.5px; resize:none; height:66px; outline:none; }
  .sb-input textarea:focus{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .sb-final{ font-size:15.5px; line-height:1.75; padding:6px 4px; }
  .sb-final .a0{ color:var(--p1); } .sb-final .a1{ color:var(--p2); }
  .sb-count{ text-align:center; font-size:11.5px; color:var(--ink-faint); margin-top:8px; letter-spacing:.5px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const PROMPTS = [
    'The two of us woke up in a tiny Paris hotel with no memory of last night — and a live goose in the bathtub.',
    'It was our wedding day, and someone had replaced the priest with a magician.',
    'We found a dusty old lamp at Chor Bazaar. Obviously, we rubbed it.',
    'At exactly midnight, every phone on Earth stopped working — except ours, which only called each other.',
    'The airline upgraded us to first class by mistake, seated next to a very famous, very sleepy celebrity.',
    'We inherited a creaky beach house from an aunt neither of us had ever heard of.',
    'Our video call glitched, and suddenly we could see exactly 24 hours into the future.',
    'The waiter brought a dish we didn’t order, with a note: “Eat this and follow me. Both of you.”',
    'One morning we woke up in each other’s bodies, with a flight to catch in 3 hours.',
    'We opened a café where every customer had to pay with a secret instead of money.',
    'The fortune teller looked at both our palms, went pale, and locked her shop.',
    'Somewhere over the Arabian Sea, the pilot announced: “Is there a couple on board? Any couple?”',
    'We adopted the world’s laziest street dog, who turned out to understand three languages.',
    'The hotel gave us the honeymoon suite — the haunted one they don’t list on the website.',
    'A time machine appeared in the living room with a sticky note: “One trip only. Choose wisely.”',
    'We entered a couples’ dance competition knowing exactly zero dance moves between us.',
    'The message in the bottle we found on the beach was addressed to us — by name.',
    'Rain trapped us in a tiny bookshop in the hills, and the owner said: “Pick one book. It picks your night.”',
  ];

  Games.register({
    id: 'story-builder', name: 'Story Builder', emoji: '📖', category: 'Couple', accent: '#c9a7ff', coop: true,
    tagline: 'One sentence each · pure chaos.',
    init: host => ({ parts: [], prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)], turn: host, minEnd: 6, limit: 14, phase: 'write', host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      const frame = ctx.h('div', { class: 'board-frame' });

      if (st.phase === 'read') {                                 // the finished masterpiece
        const fin = ctx.h('div', { class: 'sb-final' }, ctx.h('span', { style: 'color:var(--gold);font-style:italic' }, st.prompt + ' '));
        st.parts.forEach(p => fin.append(ctx.h('span', { class: 'a' + p.s }, p.t + ' ')));
        frame.append(ctx.h('h3', { class: 'center', style: 'font-family:var(--font-display);font-size:13px;letter-spacing:1px;margin:0 0 12px' }, '📖 YOUR MASTERPIECE'), fin);
        frame.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: () => ctx.commit(ctx.clone(st), 'coop-win') }, '👏 The End — take a bow'));
        ctx.root.append(frame);
        ctx.msg('Read it out loud to each other 😄', 'var(--gold)');
        return;
      }

      const story = ctx.h('div', { class: 'sb-story' });
      story.append(ctx.h('div', { class: 'sb-line prompt' }, st.prompt));
      st.parts.forEach(p => story.append(ctx.h('div', { class: 'sb-line p' + p.s }, ctx.h('small', {}, ctx.players[p.s].name), p.t)));
      frame.append(story);
      setTimeout(() => { story.scrollTop = story.scrollHeight; }, 30);

      if (ctx.state.turn === me && ctx.status === 'active') {
        const ta = ctx.h('textarea', { maxlength: '180', placeholder: 'What happens next? One sentence…' });
        const send = ctx.h('button', { class: 'btn btn-primary', onclick: add }, '➕');
        frame.append(ctx.h('div', { class: 'sb-input' }, ta, send));
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } });
        if (st.parts.length >= st.minEnd)
          frame.append(ctx.h('button', { class: 'btn btn-ghost btn-block mt', onclick: theEnd }, '✨ …and they lived happily ever after (The End)'));
        ctx.msg('Your line! Keep it going ✍️', ctx.players[me].color);
        function add() {
          const t = ta.value.trim(); if (!t) return;
          const s = ctx.clone(st); s.parts.push({ s: me, t }); ctx.sound.place();
          if (s.parts.length >= s.limit) { s.phase = 'read'; ctx.sound.win(); }
          else s.turn = 1 - me;
          ctx.commit(s);
        }
        function theEnd() { const s = ctx.clone(st); s.phase = 'read'; ctx.sound.win(); ctx.commit(s); }
      } else {
        ctx.msg(`⏳ ${ctx.seat(1 - me).name} is writing the next line…`, 'var(--ink-faint)');
      }
      frame.append(ctx.h('div', { class: 'sb-count' }, `${st.parts.length} / ${st.limit} lines · “The End” unlocks at ${st.minEnd}`));
      ctx.root.append(frame);
    },
  });
})();
