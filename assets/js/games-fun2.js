/* ============================================================
   NEW GAMES — Ghost, Two Truths & a Lie, Tug of War (online)
   ============================================================ */
(function () {
  const css = `
  .gh-frag{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:40px; letter-spacing:10px;
    text-transform:uppercase; min-height:54px; padding:10px 0; color:var(--ink); }
  .gh-frag .cur{ color:var(--violet); }
  .gh-empty{ color:var(--ink-faint); font-size:22px; letter-spacing:1px; font-family:var(--font-body); font-weight:400; }

  .tt-field{ width:100%; background:var(--bg-2); border:1px solid var(--glass-brd); border-radius:12px; padding:12px 14px; color:var(--ink); font-size:15px; outline:none; margin-bottom:8px; }
  .tt-field:focus{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .tt-mark{ display:flex; align-items:center; gap:8px; margin:2px 0 14px; font-size:13px; color:var(--ink-dim); }
  .tt-radio{ display:flex; gap:8px; }
  .tt-radio button{ width:30px; height:30px; border-radius:50%; background:var(--bg-2); border:1px solid var(--line); color:var(--ink-dim); font-weight:700; }
  .tt-radio button.on{ border-color:var(--magenta); color:var(--magenta); box-shadow:var(--glow-m); }
  .tt-stmt{ width:100%; text-align:left; padding:16px; border-radius:13px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:15px; margin-bottom:10px; line-height:1.4; transition:transform .12s var(--ease); }
  .tt-stmt:active{ transform:scale(.98); }
  .tt-stmt.lie{ border-color:var(--magenta); box-shadow:var(--glow-m); } .tt-stmt.truth{ opacity:.6; }
  .tt-num{ display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--violet); color:#06070f; font-weight:900; font-size:12px; margin-right:10px; }
  .tt-chip{ font-size:12px; padding:7px 11px; border-radius:999px; background:var(--bg-2); border:1px solid var(--glass-brd); color:var(--ink-dim); text-align:left; line-height:1.25; }
  .tt-chip:active{ transform:scale(.96); border-color:var(--violet); }

  .tow{ padding:6px 0; }
  .tow-track{ position:relative; height:46px; margin:18px 0; border-radius:999px; background:var(--bg-2); border:1px solid var(--glass-brd); overflow:hidden; }
  .tow-track::before{ content:''; position:absolute; left:50%; top:0; bottom:0; width:2px; background:var(--line); transform:translateX(-1px); }
  .tow-zone{ position:absolute; top:0; bottom:0; width:18%; } .tow-zone.l{ left:0; background:linear-gradient(90deg,var(--p1-soft),transparent); } .tow-zone.r{ right:0; background:linear-gradient(270deg,var(--p2-soft),transparent); }
  .tow-knot{ position:absolute; top:50%; width:30px; height:30px; border-radius:50%; transform:translate(-50%,-50%);
    background:radial-gradient(circle at 35% 30%, #fff, var(--violet)); box-shadow:0 0 16px var(--violet); transition:left .5s var(--ease-back); }
  .tow-tokens{ display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:6px; }
  .tow-tok{ width:52px; height:52px; border-radius:14px; font-family:var(--font-num); font-weight:900; font-size:22px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); transition:transform .12s var(--ease); }
  .tow-tok:active{ transform:scale(.9); } .tow-tok.p0{ border-color:var(--p1); color:var(--p1); } .tow-tok.p1{ border-color:var(--p2); color:var(--p2); }
  .tow-tok.spent{ opacity:.25; }
  .tow-reveal{ display:flex; align-items:center; justify-content:center; gap:24px; margin:14px 0; font-family:var(--font-num); font-weight:900; font-size:30px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  /* ---------- GHOST (Word Trap) ---------- */
  const WORDS = new Set(('about above actor acute adore agile alert alien alive alley allow alone amber amend angel anger angle ankle apart apple apply arena armor aroma array arrow aside asset audio audit avoid awake award aware bacon badge baker basic beach beard beast began begin being below bench berry birth black blade blame blank blast blaze bleak blend bless blind block bloom blown blues blush board boast bonus boost booth bound brace brain brand brave bread break breed brick bride brief bring broad brook broom brown brush build built bunch burst cabin cable cadet candy cargo carry carve cause cease chain chair chalk charm chart chase cheap check cheer chess chest chief child china choir chord chose civic claim clamp clash class clean clear clerk click cliff climb cloak clock close cloth cloud clown coach coast color comet coral could count court cover crack craft crash crazy cream creek crest crime crisp cross crowd crown crumb crush crust curve dance dealt decay delay dense depth diary dirty ditch diver dizzy dough dozen draft drain drama drank dream dress dried drift drink drive drove drown dwell eager eagle early earth eaten ebony elbow elder elect elite ember empty enact enjoy enter entry equal equip erase error essay event every exact exalt exist extra fable faint fairy faith false fancy feast fence ferry fetch fever fiber field fiery fifth fifty fight final first fixed flair flame flank flash fleet flesh float flock flood floor flora flour flown fluid flung flush focus force forge forth forty found frame frank fraud fresh fried frost frown fruit funny gamer gauge ghost giant given giver glade glare glass gleam glide globe gloom glory glove going grace grade grain grand grant grape graph grasp grass grave graze great greed green greet grief grill grind groan groom grove grown guard guess guest guide guild guilt habit handy happy harsh haste hatch haven heart heavy hedge hello hence hobby honey honor horse hotel house human humor hurry ideal igloo image inbox index inner input intro irony issue ivory jelly jewel joker jolly judge juice jumbo knack knead kneel knife knock known label labor laden ladle lance large laser later laugh layer learn lease least leave ledge lemon level light lilac limit lined linen lions liver llama lobby local lodge logic loose lover lower loyal lucky lunar lunch lying magic major maker mango maple march mason match maybe mayor meant medal medic melon mercy merge merit metal meter midst might minor mirth mixer model money month moral motor mound mount mouse mouth mover movie music naval needy nerve never newly niche night noble noise north notch novel nurse oasis ocean offer often olive onion opera orbit order organ ought ounce outer owner ozone paint panel paper party pasta patch pause peace pearl pedal penny perch petal phase phone photo piano piece pilot pinch pitch pivot pixel pizza place plain plane plant plate plaza pleat plumb plump poetic point polar porch pouch pound power press price pride prime print prior prize probe prone proof proud prove pulse punch pupil puppy purse queen query quest quick quiet quilt quirk quota quote radar radio rainy raise rally ranch range rapid raven reach react ready realm rebel refer reign relax relay reply rerun reset rhyme rider ridge rifle rinse ripen risen rival river roast robin robot rocky rogue roost rough round route royal ruler rumor rural saint salad salon sandy sauce scale scarf scene scent scoop scope score scout scrap scrub seize sense serve seven shade shaft shake shall shame shape share shark sharp sheep sheer sheet shelf shell shift shine shiny shire shirt shock shore short shout shown shrub siege sight silly since siren sixth skate skill skirt skull slate sleep slice slide slime slope small smart smash smell smile smoke snack snail snake sneak sniff snowy solar solid solve sound south space spade spare spark speak spear speed spell spend spice spike spine spire spite splat spoke spoon sport spray squad squat stack staff stage stain stair stake stale stalk stamp stand stare stark start state steam steel steep steer stem stern stick stiff still sting stink stock stone stool stoop store storm story stout stove strap straw stray strip stuck study stuff style sugar suite sunny super surge swamp swarm swear sweat sweep sweet swell swept swift swing swirl sword table taken tally tango taper tarot taste teach tease teeth tempo tenor tense tenth thank theft their theme there these thick thief thing think third those three threw throb throw thumb tidal tiger tight title toast today token tonic tooth topic torch total touch tough towel tower toxic trace track trade trail train trait tramp trash tread treat trend trial tribe trick tried tripe troop trout truce truck truly trump trunk trust truth tulip tunic turbo tutor twice twist tying ulcer ultra uncle under union unity until upper upset urban usage usher usual utter vague valet valid value valve vapor vault venue verge verse video vigor villa vinyl viola viral virus visit vital vivid vocal vodka vogue voice voter vouch vowel wagon waist waltz waste watch water weary weave wedge weigh weird whale wharf wheat wheel where which while whine whirl white whole whose widen widow width wield wince winch windy wiser witch woken woman world worry worse worst worth would wound woven wrath wreck wrist write wrong yacht yearn yeast yield young youth zebra').split(' '));
  'star area idea also only word game love time play date team home book door rain snow moon tree fire gold cute dear wish hope star cake city baby cool warm cozy ring song kiss hand face'.split(' ').forEach(w => WORDS.add(w));
  // Prefer the big shared dictionary (window.DICT, ~36k common words → fair challenges
  // like "orat"→"orator"); fall back to the small inline list if words.js didn't load.
  const isWord = f => f.length >= 4 && (window.DICT ? window.DICT.has(f) : WORDS.has(f));
  const hasPrefix = f => {
    if (window.DICT) return window.DICT.hasPrefix(f);
    for (const w of WORDS) if (w.startsWith(f)) return true; return false;
  };

  Games.register({
    id: 'ghost', name: 'Ghost', emoji: '👻', category: 'Word', accent: '#9b7bff',
    tagline: 'Add letters — don’t finish a word.',
    init: host => ({ frag: '', turn: host, last: null, host }),
    render(ctx) {
      const st = ctx.state, frag = st.frag;
      ctx.root.append(ctx.turnBar());
      ctx.root.append(ctx.h('div', { class: 'board-frame' },
        ctx.h('div', { class: 'gh-frag' }, frag ? frag.toUpperCase() : ctx.h('span', { class: 'gh-empty' }, 'pick a starting letter')),
        ctx.h('p', { class: 'center', style: 'color:var(--ink-faint);font-size:12px;margin:0' }, `${frag.length} letter${frag.length === 1 ? '' : 's'} · complete a word (4+) and you lose`)));
      if (ctx.isMyTurn) {
        const kb = ctx.h('div', { class: 'kb' });
        ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach(line => { const r = ctx.h('div', { class: 'kb-row' }); [...line].forEach(ch => r.append(ctx.h('button', { class: 'key', onclick: () => add(ch.toLowerCase()) }, ch))); kb.append(r); });
        ctx.root.append(kb);
        if (frag.length >= 2) ctx.root.append(ctx.h('button', { class: 'btn btn-ghost btn-block mt', onclick: challenge }, '“That’s not a word!” — Challenge'));
        ctx.msg('Add a letter, or challenge if you think it’s a dead end', ctx.players[ctx.me].color);
      } else waiting(ctx);
      function add(ch) {
        const nf = frag + ch; ctx.sound.tap();
        if (isWord(nf)) { ctx.sound.bad(); return ctx.commit(Object.assign(ctx.clone(st), { frag: nf, last: ctx.me }), 1 - ctx.me); } // you completed a word → you lose
        const s = ctx.clone(st); s.frag = nf; s.last = ctx.me; s.turn = 1 - ctx.me; ctx.commit(s);
      }
      function challenge() {
        // I claim no word starts with `frag`. If a word does exist → I lose; else the previous player loses.
        if (hasPrefix(frag)) { ctx.sound.bad(); return ctx.commit(ctx.clone(st), 1 - ctx.me); }
        ctx.sound.good(); return ctx.commit(ctx.clone(st), ctx.me);
      }
    },
  });

  /* ---------- TWO TRUTHS & A LIE ---------- */
  // Tap-to-fill statement ideas — a spicy/funny mix to keep rounds fresh.
  const TT_PROMPTS = [
    'I once kissed someone in a very public place.',
    'I have a secret fantasy I’ve never told you.',
    'I checked you out before we ever spoke.',
    'I’ve sent a flirty text to the wrong person.',
    'I’ve skinny-dipped at least once.',
    'I have a hidden tattoo… or do I?',
    'I thought about you the first night we met.',
    'I’ve worn something just to drive you crazy.',
    'I once laughed so hard I cried in public.',
    'I’ve eaten food off the floor and said nothing.',
    'I’ve practiced an argument in the mirror.',
    'I once got stuck in a kids’ playground slide.',
    'I secretly judge people’s phone wallpapers.',
    'I’ve pretended to be on a call to avoid someone.',
    'I’ve stalked your old photos way too far back.',
    'I can’t parallel park to save my life.',
  ];
  Games.register({
    id: 'two-truths', name: 'Two Truths & a Lie', emoji: '🤥', category: 'Couple', accent: '#ff4d9d',
    tagline: 'Spot your partner’s fib.',
    init: host => ({ phase: 'write', writer: host, statements: ['', '', ''], lie: 0, guess: null, scores: [0, 0], round: 0, rounds: 6, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, writer = st.writer, guesser = 1 - writer;
      ctx.root.append(ctx.h('div', { class: 'score-line' }, ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ' ' + st.scores[0]), '  –  ', ctx.h('span', { style: `color:${ctx.players[1].color}` }, st.scores[1] + ' ' + ctx.players[1].name)));
      ctx.msg(`Round ${st.round + 1} of ${st.rounds}`);

      if (st.phase === 'write') {
        if (me === writer) {
          let lie = 0; const fields = [];
          const card = ctx.h('div', { class: 'board-frame' }, ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 12px;font-size:13px' }, 'Write 3 statements about yourself, then mark the LIE:'));
          const ideas = ctx.h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px' },
            shuffle(TT_PROMPTS.slice()).slice(0, 3).map(p => ctx.h('button', {
              class: 'tt-chip',
              onclick: () => { const f = fields.find(x => !x.value.trim()); if (f) { f.value = p; ctx.sound.tap(); f.focus(); } else ctx.sound.bad(); },
            }, p)));
          card.append(ctx.h('p', { style: 'color:var(--violet);margin:0 0 6px;font-size:12px' }, '💡 Tap an idea to fill a blank — make it spicy 🌶️ or silly 😄:'), ideas);
          [0, 1, 2].forEach(i => { const f = ctx.h('input', { class: 'tt-field', placeholder: `Statement ${i + 1}…`, maxlength: '90' }); fields.push(f); card.append(f); });
          const radio = ctx.h('div', { class: 'tt-radio' }, [0, 1, 2].map(i => ctx.h('button', { class: i === 0 ? 'on' : '', onclick: () => { lie = i; [...radio.children].forEach((b, j) => b.classList.toggle('on', j === i)); } }, i + 1)));
          card.append(ctx.h('div', { class: 'tt-mark' }, ctx.h('span', {}, 'The lie is #'), radio));
          card.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: send }, 'Send to ' + ctx.players[guesser].name));
          ctx.root.append(card); ctx.msg('Make one a lie 😏', ctx.players[me].color);
          function send() { const vals = fields.map(f => f.value.trim()); if (vals.some(v => !v)) { ctx.sound.bad(); ctx.msg('Fill all three!', 'var(--gold)'); return; } const s = ctx.clone(st); s.statements = vals; s.lie = lie; s.phase = 'guess'; ctx.commit(s); }
        } else { ctx.root.append(frame(ctx, `${ctx.players[writer].name} is writing their truths & lie…`)); waiting(ctx, ctx.players[writer].name); }
        return;
      }
      if (st.phase === 'guess') {
        if (me === guesser) {
          const card = ctx.h('div', { class: 'board-frame' }, ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 12px;font-size:13px' }, `Which one is ${ctx.players[writer].name}’s LIE?`));
          st.statements.forEach((sTxt, i) => card.append(ctx.h('button', { class: 'tt-stmt', onclick: () => pick(i) }, ctx.h('span', { class: 'tt-num' }, i + 1), sTxt)));
          ctx.root.append(card); ctx.msg('Tap the fib', ctx.players[me].color);
          function pick(i) { const s = ctx.clone(st); s.guess = i; if (i === st.lie) s.scores[guesser]++; else s.scores[writer]++; s.phase = 'reveal'; (i === st.lie) ? ctx.sound.good() : ctx.sound.bad(); ctx.commit(s); }
        } else { ctx.root.append(frame(ctx, `${ctx.players[guesser].name} is guessing your lie…`)); waiting(ctx, ctx.players[guesser].name); }
        return;
      }
      // reveal
      const right = st.guess === st.lie;
      const card = ctx.h('div', { class: 'board-frame' }, ctx.h('p', { class: 'center', style: 'margin:0 0 12px;font-weight:700;font-size:17px;color:' + (right ? 'var(--lime)' : 'var(--magenta)') }, right ? `Caught the lie! Point to ${ctx.players[guesser].name}` : `Fooled! Point to ${ctx.players[writer].name}`));
      st.statements.forEach((sTxt, i) => card.append(ctx.h('div', { class: 'tt-stmt ' + (i === st.lie ? 'lie' : 'truth') }, ctx.h('span', { class: 'tt-num' }, i + 1), sTxt + (i === st.lie ? '  ✦ the lie' : ''))));
      ctx.root.append(card);
      if (me === st.host) {
        const last = st.round + 1 >= st.rounds;
        ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, last ? 'See result' : 'Next round'));
      } else waiting(ctx, ctx.players[st.host].name + ' to continue');
      function next() { const s = ctx.clone(st); if (s.round + 1 >= s.rounds) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1)); s.round++; s.writer = 1 - s.writer; s.statements = ['', '', '']; s.lie = 0; s.guess = null; s.phase = 'write'; ctx.commit(s); }
      function frame(ctx, t) { return ctx.h('div', { class: 'board-frame wait-card' }, ctx.h('div', { class: 'spinner' }), ctx.h('h3', {}, t)); }
    },
  });

  /* ---------- TUG OF WAR ---------- */
  Games.register({
    id: 'tug-of-war', name: 'Tug of War', emoji: '🪢', category: 'Luck', accent: '#ffd66b',
    tagline: 'Secret bids pull the rope.',
    init: host => ({ rope: 0, tokens: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]], picks: [null, null], phase: 'bid', round: 1, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      const pos = 50 + st.rope * 10; // rope -5..5 → 0..100%
      const track = ctx.h('div', { class: 'tow-track' }, ctx.h('div', { class: 'tow-zone l' }), ctx.h('div', { class: 'tow-zone r' }), ctx.h('div', { class: 'tow-knot', style: `left:${Math.max(6, Math.min(94, pos))}%` }));
      const wrap = ctx.h('div', { class: 'board-frame tow' },
        ctx.h('div', { style: 'display:flex;justify-content:space-between;font-weight:700;font-size:13px' },
          ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ' ◀'),
          ctx.h('span', { style: `color:${ctx.players[1].color}` }, '▶ ' + ctx.players[1].name)),
        track);
      ctx.root.append(wrap);

      if (st.phase === 'bid') {
        if (st.picks[me] == null) {
          const row = ctx.h('div', { class: 'tow-tokens' });
          st.tokens[me].forEach(n => row.append(ctx.h('button', { class: 'tow-tok p' + me, onclick: () => pick(n) }, n)));
          ctx.root.append(ctx.h('div', { class: 'mt center', style: 'color:var(--ink-dim);font-size:13px;margin-bottom:6px' }, 'Secretly pick a number to pull:'), row);
          ctx.msg('Choose your strength — they can’t see it', ctx.players[me].color);
        } else { ctx.root.append(frame(ctx, `Locked in. Waiting for ${ctx.players[1 - me].name}…`)); waiting(ctx, ctx.players[1 - me].name); }
        return;
      }
      // reveal
      const a = st.picks[0], b = st.picks[1];
      ctx.root.append(ctx.h('div', { class: 'tow-reveal' },
        ctx.h('span', { style: `color:${ctx.players[0].color}` }, a),
        ctx.h('span', { style: 'color:var(--ink-faint);font-size:16px' }, 'vs'),
        ctx.h('span', { style: `color:${ctx.players[1].color}` }, b)));
      ctx.root.append(ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);margin:0' }, a === b ? 'Equal — rope holds!' : `${ctx.players[a > b ? 0 : 1].name} pulls!`));
      if (me === st.host) ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, 'Next pull'));
      else waiting(ctx, ctx.players[st.host].name + ' to continue');

      function pick(n) { const s = ctx.clone(st); s.picks[me] = n; ctx.sound.tap(); if (s.picks[1 - me] != null) { s.phase = 'reveal'; ctx.sound.good(); } ctx.commit(s); }
      function next() {
        const s = ctx.clone(st); const a = s.picks[0], b = s.picks[1];
        s.tokens[0] = s.tokens[0].filter(x => x !== a); s.tokens[1] = s.tokens[1].filter(x => x !== b);
        if (a > b) s.rope -= 1; else if (b > a) s.rope += 1;
        if (s.rope <= -3) return ctx.commit(s, 0);
        if (s.rope >= 3) return ctx.commit(s, 1);
        if (s.tokens[0].length === 0) return ctx.commit(s, s.rope === 0 ? 'draw' : (s.rope < 0 ? 0 : 1));
        s.picks = [null, null]; s.phase = 'bid'; s.round++; ctx.commit(s);
      }
      function frame(ctx, t) { return ctx.h('div', { class: 'board-frame wait-card', style: 'margin-top:12px' }, ctx.h('div', { class: 'spinner' }), ctx.h('h3', {}, t)); }
    },
  });

})();
