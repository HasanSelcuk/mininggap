/* Tips for the open simulation. They float above the board and never change its layout. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'mining-gaps-tips';
  // until: the simulation event that completes a tip. ring: a smaller element to highlight.
  const tips = [
    { target: '#revenue-open', title: 'Watch the green line', text: 'Expected revenue rises as fees arrive. The miner switches on when the green line reaches the dashed electricity cost.' },
    { target: '.history', title: 'Each drop is a found block', text: 'Shaded stretches show machines running. The unshaded start of each round is a mining gap.' },
    { target: '.investor-panel', ring: '#equilibrium-button', title: 'Let the investor act', text: 'He buys machines while buying them is profitable. Press his shining button, then compare the average mining gap.', until: 'settled' },
    { target: '.scenario-options', ring: '#low-capital', title: 'Change one condition', text: 'Click Low machine ownership cost. The installed machines stay as they are.', until: 'scenario' },
    { target: '.investor-panel', ring: '#equilibrium-button', title: 'Now let the investor act again', text: 'He reacts to the new cost. Watch how the average mining gap changes.', until: 'settled' },
    { target: '.investor-panel', rings: '.board .hotspot, .board .chart-button', title: 'Tap anything with a ring', text: 'Each part opens a short note and its parameters. Graphs open larger. Tips return from the i button.' }
  ];
  let index = -1, frame = 0, advanceTimer = 0;

  const root = document.createElement('div');
  root.className = 'coach'; root.hidden = true;
  root.innerHTML = `<div class="coach-rings" aria-hidden="true"></div>
    <section class="coach-card" role="region" aria-label="Tips">
      <i class="coach-pointer" aria-hidden="true"></i>
      <span class="coach-step"></span>
      <h2 class="coach-title"></h2>
      <p class="coach-text" aria-live="polite"></p>
      <div class="coach-actions"><button class="text-button coach-hide">Hide tips</button><button class="coach-next"></button></div>
    </section>`;
  document.body.append(root);
  const card = root.querySelector('.coach-card'), rings = root.querySelector('.coach-rings');
  const pointer = root.querySelector('.coach-pointer');

  const remember = () => { try { localStorage.setItem(storageKey, 'seen'); } catch (_) { /* Optional. */ } };
  const seen = () => { try { return localStorage.getItem(storageKey) === 'seen'; } catch (_) { return false; } };
  const away = () => document.body.classList.contains('onboarding') || !!document.querySelector('dialog[open]');

  function setRings(selector) {
    const targets = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
    rings.replaceChildren(...targets.map((el, i) => {
      const ring = document.createElement('span');
      ring.className = 'coach-ring'; ring.target = el;
      ring.style.animationDelay = `${i * .12}s, ${i * .12}s`;
      return ring;
    }));
  }
  function show(next) {
    clearTimeout(advanceTimer);
    if (next >= tips.length) { stop(); return; }
    index = next;
    const tip = tips[index];
    root.querySelector('.coach-step').textContent = `Tip ${index + 1} of ${tips.length}`;
    root.querySelector('.coach-title').textContent = tip.title;
    root.querySelector('.coach-text').textContent = tip.text;
    root.querySelector('.coach-next').textContent = index === tips.length - 1 ? 'Done' : 'Next →';
    setRings(tip.rings || tip.ring || tip.target);
    root.hidden = false; root.classList.toggle('coach-many', !!tip.rings);
    card.classList.remove('entering'); void card.offsetWidth; card.classList.add('entering');
    const target = document.querySelector(tip.target);
    const box = target.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) target.scrollIntoView({ block: 'center', behavior: motion.matches ? 'instant' : 'smooth' });
    if (!away()) MiningAudio.cue('hint');
    if (!frame) frame = requestAnimationFrame(place);
  }
  function start() {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    show(0);
  }
  function stop() {
    clearTimeout(advanceTimer);
    index = -1; root.hidden = true; rings.replaceChildren();
    cancelAnimationFrame(frame); frame = 0;
    remember();
  }
  // Follows the highlighted parts while the page scrolls, resizes, or animates.
  function place() {
    frame = requestAnimationFrame(place);
    const hidden = away();
    root.classList.toggle('coach-away', hidden);
    if (hidden || index < 0) return;
    for (const ring of rings.children) {
      const r = ring.target.getBoundingClientRect(), pad = 6;
      Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    }
    const r = document.querySelector(tips[index].target).getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = innerHeight, m = 16, gap = 16;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (vw <= 600) {
      Object.assign(card.style, { left: `${m}px`, top: `${vh - ch - m}px` });
      card.dataset.side = 'docked';
      return;
    }
    let side = 'below', x, y;
    if (r.bottom + gap + ch <= vh - m) side = 'below';
    else if (r.top - gap - ch >= m) side = 'above';
    else if (r.right + gap + cw <= vw - m) side = 'right';
    else side = 'left';
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (side === 'below' || side === 'above') {
      x = clamp(r.left + r.width / 2 - cw / 2, m, vw - cw - m);
      y = side === 'below' ? r.bottom + gap : r.top - gap - ch;
      pointer.style.left = `${clamp(r.left + r.width / 2 - x, 22, cw - 22)}px`; pointer.style.top = '';
    } else {
      x = side === 'right' ? r.right + gap : r.left - gap - cw;
      y = clamp(r.top + r.height / 2 - ch / 2, m, vh - ch - m);
      pointer.style.top = `${clamp(r.top + r.height / 2 - y, 22, ch - 22)}px`; pointer.style.left = '';
    }
    Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
    card.dataset.side = side;
  }

  root.querySelector('.coach-next').addEventListener('click', () => show(index + 1));
  root.querySelector('.coach-hide').addEventListener('click', stop);
  document.addEventListener('click', e => { if (e.target.closest('[data-coach-start]')) start(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && index >= 0 && !away()) stop(); });
  document.addEventListener('mining:event', ({ detail }) => {
    if (detail.type === 'board' && index < 0 && !seen()) setTimeout(() => { if (index < 0 && !away()) show(0); }, 900);
    if (index < 0) return;
    // Acting early skips ahead to the tip after the one that asked for this action.
    const match = tips.findIndex((tip, i) => i >= index && tip.until === detail.type);
    if (match >= 0) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => show(match + 1), detail.type === 'settled' ? 1200 : 500);
    }
  });
  window.MiningCoach = { start, stop };
})();
