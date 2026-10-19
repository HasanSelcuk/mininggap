(() => {
  'use strict';
  const { B, defaults, solve, equilibrium, scenario, marketConditions, Simulation } = MiningModel;
  const $ = id => document.getElementById(id);
  const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = n => `${n >= 0 ? '+' : '−'}$${fmt(Math.abs(n))}`;
  let params = scenario(false, true, true), sim = new Simulation(params), running = false, speed = 1;
  let reaction = null, reactionUntil = 0, lastPose = '', lastInvestor = '', equilibriumAnimation = null;
  let toastTimer, lastFrame = performance.now(), lastPaint = 0;

  const PAPER_URL = 'https://arxiv.org/pdf/2610.22451';
  const fields = [
    { key: 'subsidy', name: 'Block subsidy', min: 0, max: 80, step: .1, unit: '$ / block',
      help: 'New bitcoin paid to the miner who finds a block. Every block pays the same block subsidy, so it is available from the first moment of a round, before any fees arrive. A higher block subsidy shortens the mining gap. After the investor acts, it also brings more hashpower.' },
    { key: 'lowFee', name: 'Low-tier fee', min: 0, max: 1, step: .01, unit: '$ / transaction',
      help: 'The fee paid by each blue low-fee transaction. Their supply never runs out, so they fill every place in a block that high-fee transactions leave free. Together with the block subsidy, they set the revenue a block offers at the start of a round. A higher low-tier fee shortens the mining gap.' },
    { key: 'premium', name: 'Fee premium', min: .05, max: 3, step: .05, unit: 'extra $ / transaction',
      help: 'The extra fee a green high-fee transaction pays on top of the low-tier fee. Each green transaction replaces a blue one, so each arrival raises the fees in the block by the fee premium. This is the part of the revenue that builds up during a round.' },
    { key: 'hashpower', name: 'Total hashpower', min: .1, max: 30, step: .1, unit: 'units of hashpower',
      help: 'Hashpower is the number of attempts per minute to find a block. Total hashpower adds up all machines. The difficulty adjustment keeps rounds at ten minutes on average, so more hashpower lowers the chance that each unit finds a block. Each unit then receives less, and the mining gap grows.' },
    { key: 'operating', name: 'Electricity cost (operating cost)', min: .01, max: .5, step: .01, unit: '$ / unit of hashpower / min',
      help: 'The cost of running one unit of hashpower for one minute. Miners pay it only while their machines are on. The miner switches on once expected revenue per minute reaches this cost, so a higher electricity cost makes the mining gap longer.' },
    { key: 'capital', name: 'Machine ownership cost (capital cost)', min: 0, max: .5, step: .001, unit: '$ / unit of hashpower / min',
      help: 'The cost of owning one unit of hashpower for one minute, such as the price of a machine spread over its working life. It is paid even while the machine is off, so it does not change when the miner switches on. It limits how many machines the investor buys. After the investor acts, a higher machine ownership cost means less hashpower and a shorter mining gap.' },
    { key: 'arrival', name: 'High-fee arrival rate', min: .1, max: 1.15, step: .05, unit: 'transactions / min',
      help: 'How many green high-fee transactions arrive per minute. Each arrival raises the fees in the candidate block until the block holds only green transactions. Blocks must be able to take the arrivals, so the rate stays below the block capacity per ten minutes.' },
    { key: 'capacity', name: 'Block capacity', min: 4, max: 30, step: 1, unit: 'transactions / block',
      help: 'How many transactions fit in one block.' }
  ];
  const descriptions = {
    overview: [
      'How mining gaps happen',
      '<h3>The miner</h3><p>Miners compete to add the next block. The winner receives the block subsidy and the fees of the transactions inside the block. Every running machine pays for electricity, whether it wins or not.</p>'
      + '<h3>The mining gap</h3><p>A round is the time between two consecutive blocks. A found block takes its high-fee transactions with it, so the next block starts with fewer fees. When expected revenue cannot cover electricity, the miner switches off and waits. That idle time at the start of a round is the mining gap. No block can be found while every machine is off.</p>'
      + '<h3>The investor</h3><p>Owning a machine costs money even while it is off. The investor buys machines only when expected revenue covers electricity and machine ownership costs together. More machines bring more competition, so each one receives less and waits longer.</p>'
      + '<h3>The idea</h3><p>High machine ownership costs keep fewer machines in the market. The machines that stay receive enough to keep running. In this way, capital costs can shorten mining gaps.</p>'
      + '<h3>Try it</h3><p>The checkboxes change costs and the block subsidy and keep the same machines. The investor’s button lets machines enter or leave.</p>'
      + '<div class="info-actions"><button class="text-button" data-coach-start>Show tips</button><button class="text-button" data-tour-replay>Replay the tour</button><a class="text-button" href="' + PAPER_URL + '" target="_blank" rel="noopener">Read the paper ↗</a></div>'
    ],
    mining: [
      'The miner',
      'He pays for electricity whenever his machine runs. He receives the block subsidy and the fees only when he finds the block. He switches on once expected revenue covers electricity. Until then he waits for more fees.'
    ],
    rewards: [
      'The candidate block',
      'This is the next block being prepared. Whoever finds it receives the block subsidy plus the fees of every transaction inside.'
    ],
    flow: [
      'High-fee arrivals',
      'Each green tile is a high-fee transaction. It takes the place of a blue low-fee transaction. When the block holds only green tiles, new ones wait in the mempool for a later block.'
    ],
    queue: [
      'High-fee transactions still waiting',
      '<p>These high-fee transactions did not fit in the candidate block. They stay in the mempool and wait for a later block.</p>'
    ],
    reserve: [
      'The low-fee reservoir',
      '<p>Blue transactions pay the low-tier fee. They fill every place the green ones leave free, and their supply never runs out. A replaced blue tile returns here.</p>'
    ],
    activation: [
      'Expected revenue',
      '<p>The green line is the miner’s expected revenue per minute if he runs his machine. The dashed line is his electricity cost per minute. Once the green line reaches the dashed line, mining is more profitable than waiting.</p><p>The clock restarts at every found block, when a new round begins. Rounds last ten minutes on average. A single round can take more or less.</p>'
    ],
    history: [
      'Mempool history',
      '<p>The mempool holds transactions waiting for a block. This graph shows only the high-fee transactions waiting for a block. It climbs as high-fee transactions arrive and drops when a block takes as many of them as fit. Green shading marks mining, and gold dots mark our miner’s wins.</p><p>A round is the time between two consecutive blocks. Average mining gap is the idle time per round. Unused hashpower is the share of time the machines stayed off. Both figures use the completed rounds shown here.</p>'
    ]
  };
  const emit = type => document.dispatchEvent(new CustomEvent('mining:event', { detail: { type } }));
  function showDialog(dialog) {
    if (dialog.open) return;
    dialog.showModal();
    MiningAudio.cue('open');
  }
  function buildControls() {
    for (const f of fields) {
      const wrapper = document.createElement('div'); wrapper.className = 'control-group'; wrapper.dataset.field = f.key;
      wrapper.innerHTML = `<div class="control-label"><span class="control-name"><label for="${f.key}-range">${f.name}</label><button type="button" class="parameter-info" aria-expanded="false" aria-controls="${f.key}-help" aria-label="About ${f.name}" title="About this parameter">i</button></span><input id="${f.key}-number" type="number" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.name}, ${f.unit}"></div><p id="${f.key}-help" class="parameter-help" hidden>${f.help}</p><input id="${f.key}-range" type="range" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.name}"><div class="control-meta"><span>${f.unit}</span></div>`;
      $(f.key === 'arrival' ? 'flow-controls' : 'main-controls').append(wrapper);
      const infoButton = wrapper.querySelector('.parameter-info');
      infoButton.addEventListener('click', () => {
        const open = infoButton.getAttribute('aria-expanded') !== 'true';
        infoButton.setAttribute('aria-expanded', String(open)); $(`${f.key}-help`).hidden = !open;
      });
      $(`${f.key}-range`).addEventListener('input', e => {
        change(f, e.target.value);
        MiningAudio.cue('slider', (e.target.value - e.target.min) / (e.target.max - e.target.min));
      });
      $(`${f.key}-number`).addEventListener('change', e => change(f, e.target.value));
    }
    syncControls();
  }
  function syncControls() {
    for (const f of fields) {
      const max = f.key === 'hashpower' ? Math.max(f.max, Math.ceil(params.hashpower * 1.2)) : f.key === 'arrival' ? (params.capacity / 10 - .05) : f.max;
      for (const suffix of ['range','number']) {
        const el = $(`${f.key}-${suffix}`); el.max = max; el.value = Number(params[f.key].toFixed(f.key === 'hashpower' ? 4 : 3));
      }
      $(`${f.key}-range`).style.setProperty('--range', `${100 * (params[f.key] - f.min) / (max - f.min)}%`);
    }
    $('hashpower-number').value = params.hashpower.toFixed(2);
    renderOutcome();
  }
  // The parameter card shows the gap now and the gap once the investor has acted.
  function renderOutcome() {
    if (!$('settings-dialog').open) return;
    const now = solve(params).gap, target = equilibrium(params);
    const after = target === null ? null : solve({ ...params, hashpower: target }).gap;
    const bar = (id, gap) => $(id).style.setProperty('--gap', `${Math.min(100, 100 * (gap ?? B) / B)}%`);
    setText('outcome-now', `${now.toFixed(1)} min`); bar('outcome-now-bar', now);
    setText('outcome-after', after === null ? 'Keeps growing' : `${after.toFixed(1)} min`); bar('outcome-after-bar', after);
    $('outcome-after-bar').classList.toggle('open-ended', after === null);
  }
  function change(f, value) {
    let n = Number(value);
    if (!Number.isFinite(n) || value === '') { syncControls(); return; }
    const max = f.key === 'hashpower' ? Math.max(f.max, Number($('hashpower-number').max)) : f.key === 'arrival' ? params.capacity / 10 - .05 : f.max;
    n = Math.min(max, Math.max(f.min, n));
    if (f.key === 'capacity') n = Math.round(n);
    params[f.key] = n;
    if (params.arrival * 10 >= params.capacity) {
      params.arrival = Math.max(.1, params.capacity / 10 - .05);
      toast('High-fee arrival rate lowered so blocks can take every arrival.');
    }
    cancelEquilibrium(); restart(running); syncControls();
    syncScenarioChecks();
  }
  function minerArt(pose, machineRunning) {
    const mining = pose === 'mining', happy = pose === 'won', sad = pose === 'lost';
    const mouth = happy ? 'M63 74 Q77 93 91 72 Q77 79 63 74' : sad ? 'M67 83 Q79 72 91 84' : mining ? 'M68 80 Q78 85 87 78' : 'M67 82 Q76 78 85 81';
    return `<g class="art-line"><path d="M13 192 Q115 188 245 194" stroke="#d0d3c5"/><path d="M54 129 L53 178 M57 148 L95 148 M95 133 L97 179 M51 177 L45 190 M96 178 L103 190" stroke="#a8ad97"/><path d="M56 120 Q71 99 91 117 L101 150 L64 152 Z" fill="#e3e7d7"/><path d="M68 152 L68 175 L91 184 M95 151 L109 167 L127 171"/><path d="M87 184 L96 187 L72 187 M124 169 L135 174 L116 175"/><path d="M75 99 L76 113 M59 56 Q52 65 60 84 Q69 104 88 92 Q104 84 99 64" fill="#f3ebd8"/><path d="M56 61 Q51 37 77 35 Q97 34 104 54 L97 62 Z" fill="#b8c6a3"/><path d="M48 60 Q75 51 107 58 Q117 60 102 65 L56 66 Q44 66 48 60" fill="#ced7bd"/><path d="M67 44 Q82 41 93 49" stroke="#8b9c79"/><path d="M67 70 L70 70 M85 68 L88 68" stroke-width="3"/><path d="M80 70 L78 77 L82 77" stroke-width="1.3"/><path d="${mouth}" ${happy ? 'fill="#fffaf0"' : ''} stroke-width="1.5"/>${sad ? '<path d="M65 65 L72 67 M85 64 L92 61"/>' : ''}${happy ? '<path d="M64 122 L44 102 L39 85 M92 119 L111 96 L117 82 M35 89 L39 83 L44 86 M113 84 L118 79 L122 83"/>' : mining ? '<path d="M65 122 L91 133 L144 130 M92 122 L115 138 L148 137"/><path d="M145 128 L154 129 M148 135 L155 136"/>' : '<path d="M64 122 L46 112 L63 91 M91 122 L112 145 L144 145 M62 91 L67 87 L72 90"/>'}<path d="M138 148 L231 149 L233 155 L139 155 Z" fill="#d2c8ad"/><path d="M148 157 L146 191 M222 155 L227 192"/><path d="M150 98 L222 102 L221 146 L150 143 Z" fill="#dfe4d5"/><path d="M150 98 L161 89 L234 94 L222 102 M222 102 L234 94 L233 138 L221 146" fill="#edf0e5"/><rect x="158" y="107" width="30" height="29" rx="3" fill="#f6f6ed"/><circle cx="173" cy="121" r="11" stroke="#a1ab92"/><g class="fan ${machineRunning ? 'spinning' : ''}" stroke="#889b79"><path d="M173 121 Q161 108 170 110 Q179 110 173 121 Q189 113 184 122 Q181 130 173 121 Q178 138 170 132 Q164 127 173 121" fill="#b9c7aa"/></g><path d="M197 111 L212 112 M197 117 L212 118 M197 123 L212 124" stroke="#aab59d"/><circle cx="200" cy="133" r="2" fill="${machineRunning ? '#76a862' : '#c3beac'}" stroke="none"/><path d="M231 138 Q246 145 239 166 Q235 176 245 177" stroke-width="1.4"/>${mining ? '<path d="M237 107 L246 101 M239 115 L250 113" stroke="#c2ceb4"/>' : ''}${happy ? '<g class="coin"><circle cx="125" cy="58" r="9" fill="#e8cf84" stroke="#b29954"/><path d="M125 53 L125 63 M122 55 Q130 52 128 57 L122 60 Q123 64 129 61" stroke="#ad9657" stroke-width="1"/></g><g class="coin" style="animation-delay:.35s"><circle cx="149" cy="73" r="7" fill="#e8cf84" stroke="#b29954"/></g>' : ''}</g>`;
  }
  function investorArt(mood) {
    const mouth = mood === 'happy' ? 'M55 70 Q67 81 80 69' : mood === 'sad' ? 'M55 76 Q67 67 80 76' : 'M56 73 L78 73';
    return `<g class="art-line"><path d="M20 167 Q77 163 137 168" stroke="#d4d6c7"/><path d="M44 44 Q35 69 53 86 Q71 97 88 79 Q100 63 85 44" fill="#f2e9d4"/><path d="M44 40 L45 13 L79 11 L84 39" fill="#647260"/><path d="M36 41 Q68 35 94 42 L94 48 Q65 52 34 47 Z" fill="#78866d"/><path d="M46 31 L82 29" stroke="#a5b399"/><path d="M51 61 L54 61 M75 60 L78 60" stroke-width="3"/><path d="M66 61 L64 68 L69 68" stroke-width="1.3"/><path d="${mouth}" stroke-width="1.5"/><path d="M60 87 L61 100 M78 88 L76 100 M49 103 L63 96 L76 100 L90 113 L84 145 L47 145 Z" fill="#ccd2bd"/><path d="M62 98 L68 116 L77 100 M68 117 L65 142" stroke="#8b987e"/><path d="M52 107 L38 126 L58 134 M86 109 L102 126 L85 133"/><path d="M55 126 L84 122 L94 143 L62 147 Z" fill="#fbf8e9"/><path d="M63 132 L82 129 M66 137 L85 134" stroke="#b6bea8" stroke-width="1"/><path d="M54 146 L54 163 L43 165 M77 145 L81 161 L91 166"/><path d="M43 166 L59 166 M79 166 L94 166"/></g>`;
  }
  const dialogOpen = () => !!document.querySelector('dialog[open]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const flights = new Set();
  let expandedKind = 'revenue';
  function setText(id, text) { const el = $(id); if (el.textContent !== text) el.textContent = text; }
  function info(key) {
    const [title, body] = descriptions[key];
    $('info-title').textContent = title; $('info-body').innerHTML = body;
    document.querySelectorAll('.info-tabs button').forEach(el => el.classList.toggle('active', el.dataset.info === key));
    showDialog($('info-dialog'));
  }
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  let settingsContext = 'mining';
  function syncParameterMode() {
    const editing = $('parameter-details').open;
    setText('settings-title', editing ? 'Parameters' : descriptions[settingsContext][0]);
    $('settings-description').hidden = editing;
    $('settings-dialog').classList.toggle('editing-parameters', editing);
  }
  function openSettings(group, direct = false) {
    settingsContext = group;
    setText('settings-description', descriptions[group][1]);
    $('parameter-details').open = direct;
    selectSettings(group);
    syncParameterMode();
    if ($('notebook-dialog').open) $('notebook-dialog').close();
    showDialog($('settings-dialog'));
    renderOutcome();
  }
  function selectSettings(group) {
    const groups = { rewards: ['subsidy', 'lowFee', 'premium', 'capacity'], mining: ['hashpower', 'operating', 'capital'], flow: ['arrival'] };
    document.querySelectorAll('.control-group').forEach(el => el.hidden = !groups[group].includes(el.dataset.field));
    document.querySelectorAll('[data-settings-tab]').forEach(el => {
      const selected = el.dataset.settingsTab === group;
      el.classList.toggle('active', selected); el.setAttribute('aria-pressed', selected);
    });
  }
  function setRunning(value) {
    running = value;
    $('play-button').textContent = value ? 'Ⅱ' : '▶';
    $('play-button').setAttribute('aria-label', value ? 'Pause simulation' : 'Play simulation');
    $('play-button').title = value ? 'Pause' : 'Play';
    syncMotion();
  }
  function syncMotion() {
    const blocked = dialogOpen() || document.hidden;
    const paused = !running || blocked;
    document.body.classList.toggle('paused', paused);
    if (!document.body.classList.contains('onboarding')) {
      MiningAudio.setBlocked(paused);
      MiningAudio.machine(!paused && sim.active);
    }
    for (const animation of flights) {
      if ((blocked || (!running && !animation.manual)) && animation.playState === 'running') animation.pause();
      else if (!blocked && (running || animation.manual) && animation.playState === 'paused') animation.play();
    }
  }
  function clearFlights() {
    for (const animation of flights) animation.cancel();
    flights.clear(); $('transaction-flights').replaceChildren();
  }
  function restart(play = running) {
    MiningAudio.resetEffects();
    clearFlights(); sim = new Simulation(params); syncVisualTransactions(); reaction = null; lastPose = ''; lastInvestor = '';
    $('entry-motion').textContent = ''; setRunning(play); render();
  }
  function cancelEquilibrium() {
    equilibriumAnimation = null; $('equilibrium-button').disabled = false; $('entry-motion').classList.remove('moving');
  }
  function startEquilibrium() {
    const target = equilibrium(params);
    if (target === null) { toast('With no machine ownership cost, the investor never stops buying machines.'); return; }
    if (Math.abs(target - params.hashpower) < 1e-6) return;
    setRunning(false); clearFlights(); reaction = null;
    equilibriumAnimation = { from: params.hashpower, to: target, elapsed: 0, entering: target > params.hashpower, beat: -1 };
    emit('investing');
    $('equilibrium-button').disabled = true; $('entry-motion').classList.add('moving');
  }
  // Whole tiles are a visual approximation; the economic ledger stays continuous.
  const visibleHigh = new Set();
  let visibleQueue = 0;
  function syncVisualTransactions() {
    visibleHigh.clear();
    const count = Math.floor(sim.backlog + 1e-8);
    for (let i = 0; i < Math.min(count, params.capacity); i++) visibleHigh.add(i);
    visibleQueue = Math.max(0, count - params.capacity);
  }
  function renderTiles() {
    const count = params.capacity;
    if ($('block-tiles').children.length !== count) {
      $('block-tiles').innerHTML = Array.from({ length: count }, () => '<span class="block-tile"></span>').join('');
      $('block-tiles').style.gridTemplateColumns = `repeat(${count <= 12 ? Math.ceil(count / 2) : Math.ceil(count / 3)}, 1fr)`;
    }
    [...$('block-tiles').children].forEach((el, i) => el.classList.toggle('high-fee', visibleHigh.has(i)));
    const visible = Math.min(6, visibleQueue);
    const queue = visible ? Array.from({ length: visible }, () => '<span class="tx">+</span>').join('') : '<span class="queue-empty"></span>';
    if ($('queue-tiles').innerHTML !== queue) $('queue-tiles').innerHTML = queue;
  }
  function animateTransaction(index, manual = false) {
    const queued = index >= params.capacity;
    const settle = () => { MiningAudio.cue('tile', index); if (queued) visibleQueue++; else visibleHigh.add(index); renderTiles(); };
    if (reducedMotion.matches) { settle(); return; }
    const layer = $('transaction-flights'), box = layer.getBoundingClientRect();
    // Screen rectangles in the layer's own units, which differ when the page is scaled to fit.
    const scale = box.width / layer.offsetWidth || 1;
    const local = el => { const r = el.getBoundingClientRect(); return { left: (r.left - box.left) / scale, top: (r.top - box.top) / scale, width: r.width / scale }; };
    const source = local(document.querySelector('.source-tile'));
    const candidate = local($('candidate'));
    const slot = queued ? null : $('block-tiles').children[index];
    const destination = local(queued ? $('queue-tiles') : slot);
    const from = { x: source.left, y: source.top };
    const to = { x: destination.left, y: destination.top };
    const edge = candidate.left - 25;
    const tile = document.createElement('span'); tile.className = 'tx flying-tx incoming-tx'; tile.textContent = '+'; layer.append(tile);
    const transform = (x, y, angle = 0, scale = 1) => `translate(${x}px,${y}px) rotate(${angle}deg) scale(${scale})`;
    const frames = queued ? [
      { transform: transform(from.x, from.y, -12), opacity: 0, offset: 0 },
      { transform: transform(edge, from.y - 5, 4), opacity: 1, offset: .3 },
      { transform: transform(edge + 5, from.y, -10), opacity: 1, offset: .42 },
      { transform: transform(edge - 9, from.y - 9, -18), opacity: 1, offset: .52 },
      { transform: transform(candidate.left + candidate.width / 2, candidate.top - 27, 9), opacity: 1, offset: .74 },
      { transform: transform(to.x, to.y, 4, .8), opacity: 1, offset: 1 }
    ] : [
      { transform: transform(from.x, from.y, -12), opacity: 0, offset: 0 },
      { transform: transform(from.x + 15, from.y - 8, -6), opacity: 1, offset: .12 },
      { transform: transform(edge, to.y - 12, 8), opacity: 1, offset: .5 },
      { transform: transform(to.x, to.y, 0, destination.width / 28), opacity: 1, offset: .86 },
      { transform: transform(to.x, to.y + 2, 0, destination.width / 28), opacity: 1, offset: .93 },
      { transform: transform(to.x, to.y, 0, destination.width / 28), opacity: 1, offset: 1 }
    ];
    const duration = Math.max(80, (queued ? 950 : 720) / speed);
    const animation = tile.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' });
    animation.manual = manual; flights.add(animation);
    const round = sim.number;
    animation.onfinish = () => {
      flights.delete(animation); tile.remove();
      if (round !== sim.number) return;
      settle();
      if (!queued && slot.isConnected) {
        const old = document.createElement('span'); old.className = 'tx flying-tx displaced-tx'; layer.append(old);
        const reserve = local($('reserve-stack'));
        const rx = reserve.left + 22, ry = reserve.top + 4;
        const out = old.animate([
          { transform: transform(to.x, to.y, 0, destination.width / 28), opacity: 1, offset: 0 },
          { transform: transform(to.x + 18, to.y + 24, 12, .85), opacity: 1, offset: .3 },
          { transform: transform(rx + 10, ry - 10, -8, .8), opacity: 1, offset: .75 },
          { transform: transform(rx, ry, -6, .78), opacity: 1, offset: 1 }
        ], { duration: Math.max(80, 650 / speed), easing: 'ease-in-out', fill: 'forwards' });
        out.manual = manual; flights.add(out);
        out.onfinish = () => {
          flights.delete(out); old.remove(); MiningAudio.cue('reserve');
          $('reserve-stack').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 180 });
        };
        out.oncancel = () => old.remove();
      }
    };
    animation.oncancel = () => tile.remove();
  }
  function revenueChart(target = $('revenue-chart'), expanded = false) {
    const width = expanded ? 760 : Math.max(210, target.clientWidth);
    const height = expanded ? 255 : Math.max(150, Math.min(180, target.clientHeight || 180));
    target.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const m = sim.m, h = params.hashpower / 5, elapsed = sim.time - sim.round.start;
    const maxTime = Math.max(B / 0.8, Math.ceil(elapsed / 5) * 5);
    const maxRate = Math.max(h * m.w * (m.baseline + params.premium * params.capacity), h * params.operating) * 1.2;
    const left = 20, right = width - 60, bottom = height - 34;
    const x = t => left + t / maxTime * (right - left), y = r => bottom - r / maxRate * (bottom - 28);
    const costY = y(h * params.operating), gapEnd = Math.max(0, sim.round.activation - sim.round.start);
    const revenueAt = t => h * m.w * (m.baseline + params.premium * Math.min(params.capacity, sim.round.initial + params.arrival * t));
    const saturation = Math.max(0, (params.capacity - sim.round.initial) / params.arrival);
    const corner = saturation > 0 && saturation < elapsed ? ` L${x(saturation)} ${y(revenueAt(saturation))}` : '';
    const path = `M${left} ${y(revenueAt(0))}${corner} L${x(elapsed)} ${y(revenueAt(elapsed))}`;
    const shadeCorner = saturation > gapEnd && saturation < elapsed ? ` L${x(saturation)} ${y(revenueAt(saturation))}` : '';
    const shade = elapsed > gapEnd ? `<path class="mining-shade" d="M${x(gapEnd)} ${bottom} L${x(gapEnd)} ${y(revenueAt(gapEnd))}${shadeCorner} L${x(elapsed)} ${y(revenueAt(elapsed))} L${x(elapsed)} ${bottom} Z" fill="#e0e8d6"/>` : '';
    target.innerHTML = `<title>Expected revenue - time chart</title>${shade}<path d="M${left} 22 L${left} ${bottom} L${right} ${bottom}" fill="none" stroke="#c2cbb5" stroke-width="1.3"/><path d="M${right - 5} ${bottom - 4} L${right} ${bottom} L${right - 5} ${bottom + 4}" fill="none" stroke="#c2cbb5"/><line x1="${left}" x2="${right}" y1="${costY}" y2="${costY}" stroke="#ab9e7e" stroke-width="1.4" stroke-dasharray="5 6"/><text x="${right}" y="${costY - 10}" text-anchor="end" style="fill:#9b9076;font-size:13px">electricity</text><path d="${path}" fill="none" stroke="#56794d" stroke-width="2.6"/><circle cx="${x(elapsed)}" cy="${y(revenueAt(elapsed))}" r="4" fill="#56794d" stroke="#fbfaf4" stroke-width="2"/><line x1="${x(B)}" x2="${x(B)}" y1="${bottom}" y2="${bottom + 5}" stroke="#a8b398"/><text x="${x(B)}" y="${height - 10}" text-anchor="middle" style="font-size:12px">${B} minutes</text><text class="time-axis-label" x="${width - 10}" y="${height - 10}" text-anchor="end" style="font-size:12px">time</text>`;
  }
  function historyChart(target = $('history-chart'), expanded = false) {
    const observed = MiningModel.observedHistory(sim.blocks);
    setText('average-gap', observed.count ? `${observed.averageGap.toFixed(1)} minutes` : '—');
    setText('unused-power', observed.count ? `${observed.unusedPercent.toFixed(1)}%` : '—');
    const blocks = sim.blocks.slice(-9), rounds = [...blocks, { ...sim.round, end: sim.time, before: sim.backlog, current: true }];
    const width = expanded ? 760 : Math.max(210, target.clientWidth), height = expanded ? 275 : 160;
    target.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const left = 20, right = width - 20, bottom = height - 27;
    const start = rounds[0].start, end = Math.max(start + 20, sim.time + 1);
    const maximum = Math.max(params.capacity * 1.15, sim.m.threshold * 1.25, ...rounds.map(r => r.before * 1.13));
    const x = t => left + (t - start) / (end - start) * (right - left), y = v => bottom - v / maximum * (bottom - 40);
    let paths = '', shading = '', markers = '';
    for (const r of rounds) {
      if (r.end > r.activation) shading += `<path class="mining-shade" d="M${x(r.activation)} ${bottom} L${x(r.activation)} ${y(r.initial + params.arrival * (r.activation - r.start))} L${x(r.end)} ${y(r.before)} L${x(r.end)} ${bottom} Z" fill="#e0e8d6"/>`;
      paths += `<path d="M${x(r.start)} ${y(r.initial)} L${x(r.end)} ${y(r.before)}${r.current ? '' : ` L${x(r.end)} ${y(r.after)}`}" fill="none" stroke="#617f54" stroke-width="1.8"/>`;
      if (!r.current) markers += `<circle data-discovery="true" cx="${x(r.end)}" cy="${y(r.before)}" r="${r.winner === 0 ? 4 : 2.5}" fill="${r.winner === 0 ? '#c79b42' : '#617f54'}" class="${r.winner === 0 ? 'our-win' : 'other-win'}"/>`;
    }
    target.innerHTML = `<title>Mempool History Chart</title><text class="axis-label" x="${left}" y="23" style="font-size:12px">High-fee transactions</text>${shading}<path d="M${left} 35 L${left} ${bottom} L${right} ${bottom}" fill="none" stroke="#c2cbb5"/><line x1="${left}" x2="${right}" y1="${y(sim.m.threshold)}" y2="${y(sim.m.threshold)}" stroke="#ab9e7e" stroke-dasharray="5 6"/>${paths}${markers}<circle cx="${x(sim.time)}" cy="${y(sim.backlog)}" r="2.7" fill="#617f54"/><text x="${right}" y="${height - 5}" text-anchor="end" style="font-size:12px">time</text>`;
  }
  function openChart(kind) {
    expandedKind = kind;
    setText('chart-title', kind === 'revenue' ? 'Expected revenue' : 'Mempool history');
    $('chart-description').innerHTML = descriptions[kind === 'revenue' ? 'activation' : 'history'][1];
    showDialog($('chart-dialog'));
    (kind === 'revenue' ? revenueChart : historyChart)($('expanded-chart'), true);
  }
  function ledgerRow(label, value, total = false) { return `<div class="ledger-row${total ? ' total' : ''}"><span>${label}</span><b${total && value < -.005 ? ' class="negative"' : ''}>${sign(value)}</b></div>`; }
  function renderNotebook() {
    const m = sim.m;
    $('notebook-ledger').innerHTML = ledgerRow('Expected share of block subsidy and fees', m.unitRevenue) + ledgerRow('Electricity while mining', -m.electricity) + ledgerRow('Machine ownership cost, including idle time', -m.capital) + ledgerRow('Expected net profit', m.profit, true);
    setText('notebook-verdict', Math.abs(m.profit) < .00001 ? 'Expected revenue just covers every cost. Nobody gains by entering or leaving.' : m.profit > 0 ? 'Buying new machines is profitable. There is a reason to invest.' : 'Expected revenue falls short of the costs. Some machines will leave.');
  }
  function renderInvestor() {
    const neutral = Math.abs(sim.m.profit) < .00001, mood = neutral ? 'neutral' : sim.m.profit > 0 ? 'happy' : 'sad';
    if (mood !== lastInvestor) { $('investor-art').innerHTML = investorArt(mood); lastInvestor = mood; }
    setText('investor-summary', neutral ? 'Break-even.' : sim.m.profit > 0 ? 'I’d invest.' : 'Miners will leave.');
    const action = neutral ? 'Only the costs are covered.' : sim.m.profit > 0 ? 'Let him invest' : 'Let miners quit';
    setText('equilibrium-button', equilibriumAnimation ? 'Settling…' : action);
    $('equilibrium-button').disabled = !!equilibriumAnimation || neutral;
    // The button shines whenever the investor has something to do.
    $('equilibrium-button').classList.toggle('investor-ready', !equilibriumAnimation && !neutral);
    $('investor-art').setAttribute('aria-label', neutral ? 'Investor neutral at equilibrium' : mood === 'happy' ? 'Investor happy because buying machines is profitable' : 'Investor concerned because machines are losing money');
  }
  function render() {
    syncMotion();
    const active = sim.active;
    const pose = reaction && performance.now() < reactionUntil ? reaction : active ? 'mining' : 'waiting';
    if (`${pose}-${active}` !== lastPose) {
      $('miner-art').innerHTML = minerArt(pose, active); lastPose = `${pose}-${active}`;
      $('miner-art').setAttribute('aria-label', pose === 'won' ? 'Miner celebrating a block win' : pose === 'lost' ? 'Miner disappointed after another miner won' : active ? 'Miner running the machine' : 'Miner waiting beside the idle machine');
    }
    setText('miner-speech', pose === 'won' ? 'Got it!' : pose === 'lost' ? 'Not this time.' : active ? 'Mining.' : 'Not worth mining now.');
    $('miner-speech').classList.toggle('waiting', pose === 'waiting');
    renderTiles(); revenueChart(); historyChart(); renderInvestor();
    if ($('notebook-dialog').open) renderNotebook();
    if ($('chart-dialog').open) (expandedKind === 'revenue' ? revenueChart : historyChart)($('expanded-chart'), true);
  }
  function advance(dt, manual = false) {
    const before = Math.floor(sim.backlog + 1e-8);
    const wasActive = sim.active;
    const found = sim.advance(dt);
    if (found.length) {
      clearFlights(); syncVisualTransactions(); const block = found.at(-1);
      MiningAudio.cue('block', block.winner === 0 ? 1 : 0); emit('block');
      reaction = block.winner === 0 ? 'won' : 'lost'; reactionUntil = performance.now() + 1300;
      if (!reducedMotion.matches) $('candidate').animate([{ opacity: .4, transform: 'translateY(-9px) rotate(2deg)' }, { opacity: 1, transform: 'translateY(0) rotate(-1deg)' }], { duration: 450 });
    } else {
      if (!wasActive && sim.active) { MiningAudio.cue('start'); emit('start'); }
      renderTiles();
      const after = Math.floor(sim.backlog + 1e-8);
      for (let index = before; index < after; index++) animateTransaction(index, manual);
    }
  }
  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, .1); lastFrame = now;
    if (equilibriumAnimation && !dialogOpen() && !document.hidden) {
      const a = equilibriumAnimation; a.elapsed += dt;
      const t = Math.min(1, a.elapsed / 2.2), ease = t * t * (3 - 2 * t);
      const beat = Math.min(3, Math.floor(t * 4));
      if (beat > a.beat) { a.beat = beat; MiningAudio.cue(a.entering ? 'invest' : 'cost', beat); }
      params.hashpower = a.from + (a.to - a.from) * ease;
      sim = new Simulation(params); syncVisualTransactions(); syncControls();
      $('entry-motion').textContent = a.entering ? '← ← ←' : '→ → →';
      $('entry-motion').setAttribute('aria-label', a.entering ? 'Hashpower enters' : 'Hashpower leaves');
      if (t === 1) {
        cancelEquilibrium(); restart(true); $('entry-motion').textContent = '✓'; $('entry-motion').setAttribute('aria-label', 'At equilibrium');
        MiningAudio.cue('settle'); emit('settled');
      }
    } else if (running && !document.hidden && !dialogOpen()) advance(dt * speed);
    if (now - lastPaint > 60) { render(); lastPaint = now; }
    requestAnimationFrame(frame);
  }
  function syncScenarioChecks() {
    $('low-capital').checked = params.capital < 0.04;
    $('low-reward').checked = params.subsidy < 25;
  }
  function applyScenario(e) {
    MiningAudio.cue('toggle', e?.target.checked ? 1 : 0);
    emit('scenario');
    cancelEquilibrium();
    params = marketConditions(params, $('low-capital').checked, $('low-reward').checked);
    syncControls(); restart(true);
  }
  document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => info(button.dataset.info)));
  document.querySelectorAll('[data-settings]').forEach(button => button.addEventListener('click', () => openSettings(button.dataset.settings, button.dataset.direct === 'true')));
  document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => selectSettings(button.dataset.settingsTab)));
  document.querySelectorAll('[data-chart]').forEach(button => button.addEventListener('click', () => openChart(button.dataset.chart)));
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', syncMotion);
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  });
  $('parameter-details').addEventListener('toggle', syncParameterMode);
  $('investor-button').addEventListener('click', () => { renderNotebook(); showDialog($('notebook-dialog')); });
  $('apply-settings').addEventListener('click', () => { document.querySelectorAll('dialog[open]').forEach(el => el.close()); setRunning(true); });
  $('play-button').addEventListener('click', () => { cancelEquilibrium(); setRunning(!running); });
  $('step-button').addEventListener('click', () => { cancelEquilibrium(); setRunning(false); advance(Math.max(1e-8, sim.nextEventTime() - sim.time), true); render(); });
  $('reset-button').addEventListener('click', () => { cancelEquilibrium(); restart(); });
  $('defaults-button').addEventListener('click', () => { cancelEquilibrium(); params = scenario(false, true, true); syncControls(); syncScenarioChecks(); restart(true); });
  $('speed').addEventListener('change', e => { speed = Number(e.target.value); });
  $('equilibrium-button').addEventListener('click', startEquilibrium);
  $('low-capital').addEventListener('change', applyScenario);
  $('low-reward').addEventListener('change', applyScenario);
  document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); syncMotion(); });
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !document.body.classList.contains('onboarding') && !/INPUT|BUTTON|SELECT|SUMMARY|TEXTAREA/.test(e.target.tagName) && !dialogOpen()) { e.preventDefault(); cancelEquilibrium(); setRunning(!running); } });
  addEventListener('resize', () => { clearFlights(); syncVisualTransactions(); renderTiles(); });
  window.MiningIllustration = {
    minerArt, investorArt,
    begin() { lastFrame = performance.now(); setRunning(true); render(); },
    pause() { cancelEquilibrium(); setRunning(false); MiningAudio.machine(false); MiningAudio.setBlocked(false); }
  };
  document.querySelectorAll('[data-paper-link]').forEach(link => { link.href = PAPER_URL; });
  buildControls(); setRunning(false); render(); requestAnimationFrame(frame);
})();

