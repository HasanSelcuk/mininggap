/* On desktop widths, shrinks the page evenly so the current screen fits the window height.
   The layout keeps its unscaled width, so every proportion stays as designed. */
(() => {
  'use strict';
  const SMALLEST = .8;
  const desktop = matchMedia('(min-width: 1001px)');
  const root = document.documentElement, body = document.body;
  const selector = 'body > .site-header, body > .onboarding-panel, body > .board, body > .site-footer';
  let mode = '', frame = 0;

  const outerHeight = el => {
    const style = getComputedStyle(el);
    return el.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  };
  // The welcome and the tour share one scale, so the header keeps its size between them.
  function update(force = false) {
    const next = body.classList.contains('onboarding') ? 'intro' : 'board';
    if (!force && next === mode) return;
    mode = next;
    body.classList.remove('fit');
    if (!desktop.matches) return;
    const parts = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
    const style = getComputedStyle(body);
    const available = innerHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
    const total = parts.reduce((sum, el) => sum + outerHeight(el), 0);
    let fit = available / total;
    // When even the smallest scale cannot show everything, the board alone fills the window
    // and the header sits just above it.
    if (fit < SMALLEST && mode === 'board') fit = available / (total - outerHeight(document.querySelector('.site-header')));
    fit = Math.max(SMALLEST, Math.min(1, fit));
    root.style.setProperty('--fit', fit.toFixed(4));
    root.style.setProperty('--fit-width', `${document.querySelector('.site-header').offsetWidth}px`);
    body.classList.add('fit');
    if (mode === 'board' && root.scrollHeight > innerHeight) {
      document.querySelector('.board').scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => update(true)); };
  new MutationObserver(() => update()).observe(body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', refresh);
  desktop.addEventListener('change', refresh);
  document.fonts?.ready.then(refresh);
  update(true);
  window.MiningFit = { update: () => update(true) };
})();
