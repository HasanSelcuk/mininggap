(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('intro-stage');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const { minerArt, investorArt } = MiningIllustration;
  const { scenario, solve, equilibrium } = MiningModel;
  const base = scenario(false, true);
  let step = -1, generation = 0, busy = false, capitalStage = 0;
  const animations = new Set();
  const money = n => `$${n.toFixed(2)}`;
  const steps = [
    ['The miner has two sources of revenue', 'Miners race to add the next block. The winner collects new bitcoin, called the block subsidy, plus the fees paid by senders.', 'Find a block'],
    ['Higher fees make the block worth more', 'Blue transactions pay a low fee. Green ones pay more. Miners prefer to include as many green ones as possible. Send three green transactions and watch them replace blue ones.', 'Send three transactions'],
    ['Sometimes the miner waits', 'Electricity costs money while the machine runs. The miner waits until expected revenue reaches that cost. The time he waits is a mining gap.', 'Let the fees build up'],
    ['Transactions complete as new blocks are found', 'High-fee transactions keep arriving while miners work. Each one replaces a blue transaction in the candidate block. When a block is found, the transactions inside it are complete.', 'Watch the next block'],
    ['The block subsidy can shorten the mining gap', 'The block subsidy pays the same even when fees are low. Keep the same machines and raise the block subsidy. Watch expected revenue rise above the electricity cost.', 'Raise the block subsidy'],
    ['The investor considers the cost of owning machines', 'Ownership costs continue even when machines are off. Lower the machine ownership cost, then let the investor buy machines. Watch how competition shapes the mining gap.', 'Lower the ownership cost'],
    ['Now follow both decisions together', 'The miner decides when to switch on. The investor decides how many machines to own. A few tips on the next page show where to start.', null]
  ];
  // Step 4 counts waiting high-fee transactions. A block is found when the count reaches PEAK.
  const FOUND = .65, PEAK = 9;
  function label(x, y, text, cls = '', anchor = 'middle') {
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="tour-label ${cls}">${text}</text>`;
  }
  function coin(x, y, cls = '', id = '') {
    return `<g transform="translate(${x} ${y})"><g ${id ? `id="${id}"` : ''} class="tour-coin ${cls}"><circle r="18"/><path d="M0 -11V11 M6 -7C-9 -12 -10 1 0 0S10 12 -7 7"/></g></g>`;
  }
  function machine(x, y, id = '', scale = 1) {
    return `<g transform="translate(${x} ${y}) scale(${scale})"><g id="${id}" class="tour-machine"><path d="M0 8L14 0H86L74 8V57H0Z"/><path d="M74 8L86 0V48L74 57 M0 8H74"/><circle cx="26" cy="31" r="16"/><g class="tour-machine-fan"><path d="M26 31Q8 15 22 17Q36 16 26 31Q46 19 43 33Q40 44 26 31Q37 52 23 46Q12 41 26 31"/></g><path d="M50 20H65 M50 27H65 M50 34H65"/><circle class="tour-led" cx="57" cy="46" r="3"/></g></g>`;
  }
  function miner(x, y, pose = 'waiting', scale = 1) {
    return `<g transform="translate(${x} ${y}) scale(${scale})"><g id="tour-miner">${minerArt(pose, pose === 'mining')}</g></g>`;
  }
  function investor(x, y, mood = 'happy', scale = 1) {
    return `<g transform="translate(${x} ${y}) scale(${scale})"><g id="tour-investor">${investorArt(mood)}</g></g>`;
  }
  function block(x, y, count = 0, id = 'tour-block') {
    return `<g transform="translate(${x} ${y})"><g id="${id}"><rect class="tour-block-outline" width="220" height="116" rx="7"/>${Array.from({length:12},(_,i)=>`<rect id="${id}-tile-${i}" class="tour-tile ${i<count?'green':'blue'}" x="${14+i%6*33}" y="${16+Math.floor(i/6)*44}" width="27" height="33" rx="3"/>`).join('')}</g></g>`;
  }
  function arrow(d, id = '', cls = '') { return `<path ${id ? `id="${id}"` : ''} class="tour-arrow ${cls}" d="${d}" marker-end="url(#tour-arrowhead)"/>`; }
  function chart(kind = 'revenue') {
    return `<g class="tour-chart"><path id="tour-chart-shade" fill="#dfe8d5"/><path class="tour-axis" d="M335 65V290H855"/>${label(335,43,kind==='revenue'?'Expected revenue per minute':'Waiting high-fee transactions','','start')}${label(850,317,'time','','end')}${kind==='revenue'?'<path class="tour-cost-line" d="M335 175H855"/>'+label(850,165,'electricity cost','tour-small','end'):''}<path id="tour-chart-line" class="tour-revenue-line"/><circle id="tour-chart-dot" r="5" fill="#56794d"/></g>`;
  }
  function setScene(content, caption) {
    stage.innerHTML = `<defs><marker id="tour-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L8 5L1 9" fill="none" stroke="#96a587" stroke-width="1.4"/></marker></defs>${content}`;
    stage.setAttribute('aria-label', caption);
  }
  function pose(value) {
    if (!$('tour-miner')) return;
    if (value === 'mining' && !$('tour-miner').querySelector('.spinning')) MiningAudio.cue('start');
    if (value === 'won') MiningAudio.cue('block', 1);
    MiningAudio.machine(value === 'mining');
    $('tour-miner').innerHTML = minerArt(value, value === 'mining');
  }
  function cancel() {
    MiningAudio.resetEffects();
    generation++;
    for (const a of animations) a.cancel();
    animations.clear(); busy = false;
  }
  async function animate(el, frames, duration = 800, options = {}) {
    if (!el) return;
    if (motion.matches) { Object.assign(el.style, frames.at(-1)); return; }
    const a = el.animate(frames, {duration, easing:'cubic-bezier(.22,.7,.25,1)', fill:'forwards', ...options});
    animations.add(a);
    await a.finished.catch(() => {});
    animations.delete(a);
  }
  function tween(duration, draw) {
    const token = generation;
    if (motion.matches) { draw(1); return Promise.resolve(); }
    return new Promise(resolve => {
      let elapsed = 0, last = performance.now();
      function frame(now) {
        if (generation !== token) return resolve();
        if (!document.hidden) elapsed += Math.min(now - last, 50);
        last = now;
        const t = Math.min(1, elapsed / duration); draw(t);
        if (t === 1) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  function enterScene() {
    if (!motion.matches) animate(stage, [{opacity:0, transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}], 550);
  }
  function welcome() {
    if (matchMedia('(max-width: 600px)').matches) {
      stage.setAttribute('viewBox','0 0 600 380');
      setScene(`${miner(5,110,'mining',1.08)}${investor(416,133,'happy',1.02)}
        ${label(109,92,'The miner','tour-hand')}${label(493,111,'The investor','tour-hand')}
        <g transform="translate(252 78) scale(.67)">${block(0,0,4)}</g>
        ${label(325,60,'The next block','tour-hand')}
        ${arrow('M257 239Q327 285 411 234','','tour-draw')}${coin(327,257,'welcome-coin')}`,
        'A miner runs his machine while an investor considers buying machines');
      $('onboarding-panel').dataset.scene = 'welcome';
      return;
    }
    // A wide, short scene under the subtitle. The miner stands far left under his question,
    // the block sits in the middle, and the investor stands far right under his.
    stage.setAttribute('viewBox','0 0 1340 305');
    setScene(`${miner(-5,15,'mining',1.29)}${investor(1108,46,'happy',1.11)}
      ${label(188,27,'When should I switch on?','tour-hand welcome-question')}${label(1166,44,'Should I buy more machines?','tour-hand welcome-question')}
      <path class="tour-arrow tour-draw" pathLength="300" d="M330 262 Q685 300 1095 228" marker-end="url(#tour-arrowhead)"/>
      ${label(680,95,'The next block','tour-hand')}
      <g transform="translate(560 112) scale(1.08)">${block(0,0,4)}
        <g class="welcome-tile"><rect class="tour-tile green" x="146" y="16" width="27" height="33" rx="3"/></g></g>
      ${coin(686,300,'welcome-coin')}`,
      'A miner runs his machine beside a candidate block while an investor considers buying machines');
    $('onboarding-panel').dataset.scene = 'welcome';
    fitWelcome(); requestAnimationFrame(fitWelcome);
  }
  // Desktop only. The welcome card fills the window between header and footer,
  // and the drawing takes exactly the height the text and buttons leave free.
  function fitWelcome() {
    const panel = $('onboarding-panel'), wrap = stage.parentElement;
    panel.style.removeProperty('--welcome-height'); wrap.style.maxWidth = '';
    if (step !== -1 || panel.hidden || !matchMedia('(min-width: 1001px)').matches) return;
    const px = v => parseFloat(v) || 0;
    const outer = el => { const c = getComputedStyle(el); return el.offsetHeight + px(c.marginTop) + px(c.marginBottom); };
    const body = getComputedStyle(document.body), box = getComputedStyle(panel);
    const height = Math.floor(innerHeight - px(body.paddingTop) - px(body.paddingBottom)
      - outer(document.querySelector('.site-header')) - outer(document.querySelector('.site-footer')));
    const wrapStyle = getComputedStyle(wrap);
    const fixed = px(box.paddingTop) + px(box.paddingBottom) + px(box.borderTopWidth) + px(box.borderBottomWidth)
      + outer($('intro-welcome')) + outer($('welcome-actions')) + px(wrapStyle.marginTop) + px(wrapStyle.marginBottom);
    const [, , w, h] = stage.getAttribute('viewBox').split(' ').map(Number);
    const room = panel.clientWidth - px(box.paddingLeft) - px(box.paddingRight);
    panel.style.setProperty('--welcome-height', `${height}px`);
    // The drawing keeps a margin at the sides, like a page, and otherwise takes the free height.
    wrap.style.maxWidth = `${Math.max(320, Math.min(room * .88, (height - fixed - 2) * w / h))}px`;
  }
  function renderStep() {
    stage.setAttribute('viewBox','0 0 900 400');
    const [title, copy, action] = steps[step];
    $('guide-progress').textContent = `${step+1} of ${steps.length}`;
    $('guide-dots').innerHTML = steps.map((_,i)=>`<i class="${i<=step?'filled':''}"></i>`).join('');
    $('guide-title').textContent=title; $('guide-copy').textContent=copy;
    $('guide-feedback').textContent=''; $('guide-action').textContent=action || '';
    $('guide-action').hidden=!action; $('guide-action').disabled=false;
    $('guide-back').disabled=step===0; $('guide-next').disabled=!!action;
    $('guide-next').textContent=step===6?'Open the simulation →':'Continue →';
    nudge(action ? $('guide-action') : $('guide-next'));
    const card=$('guide'); card.classList.remove('entering'); void card.offsetWidth; card.classList.add('entering');
    $('onboarding-panel').dataset.scene=String(step);
    if(step===0) {
      setScene(`${miner(55,122,'waiting',1.2)}${block(565,174,5)}${label(675,151,'A block of transactions','tour-hand')}
        ${coin(550,75,'','subsidy-coin')}${label(550,35,'Block subsidy')}${coin(785,75,'fee-coin','fee-coin')}${label(785,35,'Transaction fees')}
        ${arrow('M520 95 Q450 110 395 205','reward-arrow')}${arrow('M753 93 Q600 105 415 230','fee-arrow')}
        ${label(215,386,'Every running machine uses electricity','tour-hand')}
        <g id="block-found" opacity="0">${label(670,334,'Block found','tour-hand')}</g>`, 'The block subsidy and transaction fees go to the miner who finds the block');
    } else if(step===1) {
      setScene(`${block(343,92)}${label(453,72,'Candidate block','tour-hand')}
        <g id="arriving-tiles">${[0,1,2].map(i=>`<rect id="incoming-${i}" class="tour-tile green" x="${65+i*43}" y="140" width="30" height="35" rx="3"/>`).join('')}</g>
        ${label(122,118,'Higher fees','tour-hand')}${arrow('M207 157 Q258 142 320 155')}
        ${label(453,243,'Fees in this block','tour-small')}
        <text id="fee-total" x="453" y="284" text-anchor="middle" class="tour-amount">$1.20</text>
        <path class="tour-reserve-line" d="M92 334H258"/><text x="270" y="333" class="tour-infinity">∞</text>
        ${label(175,366,'Replaced blue ones wait here','tour-small')}
        ${[0,1,2].map(i=>`<rect id="displaced-${i}" class="tour-tile blue" x="${357+i*33}" y="108" width="27" height="33" rx="3" opacity="0"/>`).join('')}
        ${miner(642,142,'waiting',.78)}`, 'Green high-fee transactions replace blue low-fee transactions in the candidate block');
    } else if(step===2) {
      setScene(`${miner(25,115,'waiting',1)}${chart()}
        <circle class="tour-clock-face" cx="155" cy="68" r="28"/><path id="clock-hand" class="tour-clock-hand" d="M155 68V47"/>
        ${label(155,332,'Machine off','tour-hand')}
        <path id="tour-gap-bracket" class="tour-bracket" d="M335 333v8h0v-8"/>
        <text id="tour-gap-label" x="385" y="369" text-anchor="middle" class="tour-label tour-hand">Waiting for fees</text>`, 'Expected revenue rises towards the electricity cost while the machine waits');
      drawRevenue(0);
    } else if(step===3) {
      setScene(`${miner(35,130,'mining',.85)}${chart('history')}${block(54,23,0,'history-block')}
        <g id="departing-block" opacity="0">${block(54,23,PEAK,'departing-tiles')}</g>
        <text id="tour-chart-count" class="tour-label tour-small" text-anchor="start"></text>
        <g id="found-mark" opacity="0"><path class="tour-found-line" d="M${335+500*FOUND} 300V${290-PEAK*16-28}"/>${label(335+500*FOUND,290-PEAK*16-38,'Block found','tour-small')}</g>
        <text id="history-status" x="570" y="370" text-anchor="middle" class="tour-label tour-hand">High-fee transactions arrive while miners work</text>`, 'Waiting high-fee transactions fill the candidate block and drop to zero when the block is found');
      drawHistory(0);
    } else if(step===4) {
      setScene(`${miner(18,145,'waiting',1)}${chart()}
        ${coin(130,63,'','rising-subsidy')}<text id="subsidy-value" x="155" y="115" text-anchor="middle" class="tour-label">$0.50 per block</text>
        <path id="before-line" class="tour-before-line" d="M335 259L480 175"/>
        <text id="subsidy-gap" x="576" y="365" text-anchor="middle" class="tour-label tour-hand">Expected mining gap of 3.2 minutes</text>`, 'A higher block subsidy lifts expected revenue above the electricity cost');
      $('tour-chart-line').setAttribute('d','M335 259L480 175');
      $('tour-chart-dot').setAttribute('cx',480); $('tour-chart-dot').setAttribute('cy',175);
    } else if(step===5) {
      setScene(`${investor(34,127,'neutral',1.1)}
        <g id="capital-tag"><path class="tour-price-tag" d="M35 35H216L235 63L216 91H35Z"/><text id="capital-value" x="127" y="72" text-anchor="middle" class="tour-amount">$0.080</text></g>
        ${label(130,114,'per unit of hashpower per minute','tour-small')}
        ${[0,1,2,3,4,5].map(i=>machine(325+(i%3)*162,115+Math.floor(i/3)*110,`new-machine-${i}`,1.15)).join('')}
        ${label(551,72,'Machines competing for the next block','tour-hand')}
        <path class="tour-gap-track" d="M310 350H825"/><path id="capital-gap-bar" class="tour-gap-fill" d="M310 350H474"/>
        <text id="capital-gap" x="565" y="393" text-anchor="middle" class="tour-label">Expected mining gap of 3.2 minutes</text>`, 'The investor considers machine ownership costs and how many machines compete for each block');
      for(let i=2;i<6;i++) $(`new-machine-${i}`).style.opacity=0;
    } else {
      setScene(`${miner(47,118,'mining',1.2)}${investor(685,145,'happy',1.1)}
        ${label(205,82,'When to mine','tour-hand')}${label(756,103,'Whether to invest','tour-hand')}
        ${block(410,150,5)}${arrow('M365 227Q393 204 408 210')}${arrow('M648 210Q676 209 690 232')}
        ${label(517,325,'Fees, block subsidy, and ownership costs','tour-hand')}
        <g class="tour-final-check"><path d="M462 366l12 12 27-28"/></g>`, 'The miner and investor are ready for the interactive simulation');
    }
    MiningAudio.machine(step === 3 || step === 6);
    enterScene();
    $('guide-title').focus({preventScroll:true});
  }
  function drawRevenue(t) {
    const x=335+210*t, y=259-110*t;
    $('tour-chart-line').setAttribute('d',`M335 259L${x} ${y}`);
    $('tour-chart-dot').setAttribute('cx',x);$('tour-chart-dot').setAttribute('cy',y);
    $('clock-hand').setAttribute('transform',`rotate(${t*300} 155 68)`);
    const crossing=84/110;
    const gapWidth=Math.min(t,crossing)*210;
    $('tour-gap-bracket').setAttribute('d',`M335 333v8h${gapWidth}v-8`);
    if(t>=crossing) {
      if(!$('tour-miner').querySelector('.spinning')) pose('mining');
      stage.querySelectorAll('.tour-hand')[0].textContent='Machine on';
      $('tour-gap-label').textContent='Mining gap';
      $('tour-chart-shade').setAttribute('d',`M${335+crossing*210} 290V175L${x} ${y}V290Z`);
    }
  }
  // High-fee transactions arrive at a steady rate. Each one turns a tile of the candidate block green.
  // The found block takes them all, so the count drops to zero and the tiles turn blue again.
  function drawHistory(t) {
    const count=PEAK*(t<FOUND?t:t-FOUND)/FOUND, x=335+500*t, y=290-count*16;
    const d=t<FOUND?`M335 290L${x} ${y}`:`M335 290L${335+500*FOUND} ${290-PEAK*16}V290L${x} ${y}`;
    $('tour-chart-line').setAttribute('d',d);
    $('tour-chart-shade').setAttribute('d',`${d}V290H335Z`);
    $('tour-chart-dot').setAttribute('cx',x);$('tour-chart-dot').setAttribute('cy',y);
    const whole=Math.floor(count+1e-9), text=$('tour-chart-count');
    text.setAttribute('x',x+10); text.setAttribute('y',y-12); text.textContent=String(whole);
    for(let i=0;i<12;i++) {
      const tile=$(`history-block-tile-${i}`), green=i<whole;
      if(green===tile.classList.contains('green')) continue;
      tile.setAttribute('class',`tour-tile ${green?'green':'blue'}`);
      if(green&&t>0) { animate(tile,[{transform:'scale(1.3)'},{transform:'scale(1)'}],320); MiningAudio.cue('tile',i); }
    }
  }
  // A soft pulse marks the one button that moves the tour forward.
  function nudge(el) {
    for (const b of [$('guide-action'), $('guide-next')]) b.classList.toggle('nudge', b === el);
  }
  function feedback(message) {
    const el=$('guide-feedback'); el.textContent=message;
    el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
  }
  function complete(message) {
    busy=false; feedback(message);
    $('guide-action').disabled=true; $('guide-action').textContent='Done ✓';
    $('guide-next').disabled=false; nudge($('guide-next'));
  }
  async function action() {
    if(busy || step<0) return;
    busy=true; $('guide-action').disabled=true; nudge(null);
    if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({block:'start',behavior:'instant'});
    const token=generation;
    const valid=()=>generation===token;
    if(step===0) {
      pose('mining');
      await tween(1100, t=>$('tour-block').style.transform=`translateY(${-Math.sin(t*Math.PI*4)*3}px)`);
      if(!valid())return;
      pose('won'); $('block-found').setAttribute('opacity',1);
      await Promise.all([
        animate($('subsidy-coin'),[{transform:'translate(0,0)'},{transform:'translate(-190px,-35px)',offset:.5},{transform:'translate(-310px,165px)'}],1400),
        animate($('fee-coin'),[{transform:'translate(0,0)'},{transform:'translate(-285px,-15px)',offset:.5},{transform:'translate(-490px,180px)'}],1700)
      ]);
      if(!valid())return;
      complete('The winning miner receives both the block subsidy and the fees. Even though the other miners got nothing, they paid for electricity to run their machines.');
    } else if(step===1) {
      for(let i=0;i<3;i++) {
        await animate($(`incoming-${i}`),[{transform:'translate(0,0) rotate(-6deg)'},{transform:`translate(${146-i*5}px,-52px) rotate(4deg)`,offset:.55},{transform:`translate(${292-i*10}px,-32px) rotate(0deg)`}],750);
        if(!valid())return;
        $(`incoming-${i}`).style.opacity=0;
        $(`tour-block-tile-${i}`).classList.replace('blue','green');
        MiningAudio.cue('tile', i);
        const displaced=$(`displaced-${i}`); displaced.setAttribute('opacity',1);
        const dx=-252+i*7, dy=192;
        await Promise.all([
          animate(displaced,[{transform:'translate(0,0) rotate(0deg)'},{transform:`translate(${dx*.35}px,-30px) rotate(-14deg)`,offset:.35},{transform:`translate(${dx}px,${dy}px) rotate(${i*7-7}deg)`,offset:.86},{transform:`translate(${dx}px,${dy-5}px) rotate(${i*7-7}deg)`,offset:.93},{transform:`translate(${dx}px,${dy}px) rotate(${i*7-7}deg)`}],800).then(()=>valid()&&MiningAudio.cue('reserve')),
          tween(600,t=>$('fee-total').textContent=money(1.2+i+t))
        ]);
        if(!valid())return;
      }
      complete('Each green transaction adds $1 more than the blue one it replaces. The block now holds $4.20 in fees.');
    } else if(step===2) {
      await tween(4200, drawRevenue); if(!valid())return;
      complete('When the expected revenue from the block subsidy and fees reaches the electricity cost, the machine switches on. The shaded area marks the time spent mining.');
    } else if(step===3) {
      let found=false;
      await tween(5600,t=>{
        if(t>=FOUND&&!found) {
          found=true; pose('won'); $('departing-block').setAttribute('opacity',1); $('found-mark').setAttribute('opacity',1);
          animate($('departing-block'),[{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate(150px,-40px) scale(.5)',opacity:0}],1100);
          $('history-status').textContent='A block is found and its high-fee transactions are complete';
        }
        drawHistory(t);
      });
      if(!valid())return;
      complete('The found block took every waiting high-fee transaction, so the count dropped to zero. New arrivals bring fees for the next block.');
    } else if(step===4) {
      MiningAudio.cue('subsidy');
      await tween(2600,t=>{
        const bias=95*t;
        const y0=259-bias, y1=175-bias;
        $('tour-chart-line').setAttribute('d',`M335 ${y0}L480 ${y1}`);
        $('tour-chart-dot').setAttribute('cx',480); $('tour-chart-dot').setAttribute('cy',y1);
        $('subsidy-value').textContent=`${money(.5+49.5*t)} per block`;
        $('rising-subsidy').style.transform=`scale(${1+t*.45})`;
        if(y0<175) { if(!$('tour-miner').querySelector('.spinning')) pose('mining');$('tour-chart-shade').setAttribute('d',`M335 290V${y0}L480 ${y1}V290Z`); }
        const gap=solve({...base,subsidy:.5+49.5*t}).gap;
        $('subsidy-gap').textContent=`Expected mining gap of ${gap.toFixed(1)} minutes`;
      });
      if(!valid())return;
      complete('With the same machines and a higher block subsidy, mining is profitable from the start of the round.');
    } else if(step===5&&capitalStage===0) {
      MiningAudio.cue('cost');
      await tween(1600,t=>{$('capital-value').textContent=`$${(.08-.076*t).toFixed(3)}`;$('capital-tag').style.transform=`rotate(${-Math.sin(t*Math.PI)*5}deg)`;});
      if(!valid())return;
      $('tour-investor').innerHTML=investorArt('happy'); capitalStage=1;busy=false;
      feedback('The mining gap stays the same while the same machines remain. A lower machine ownership cost now leaves room for more investment.');
      $('guide-action').textContent='Let the investor buy machines'; $('guide-action').disabled=false; nudge($('guide-action'));
    } else if(step===5) {
      const cheap={...base,capital:.004}, target=equilibrium(cheap), start=base.hashpower;
      let arrived = -1;
      await Promise.all([
        ...[2,3,4,5].map((i)=>animate($(`new-machine-${i}`),[{opacity:0,transform:'translate(170px,-18px)'},{opacity:1,transform:'translate(0,0)'}],900,{delay:(i-2)*450})),
        tween(2700,t=>{
          const count = Math.min(3, Math.floor(t * 4));
          if (count > arrived) { arrived = count; MiningAudio.cue('invest', count); }
          const p={...cheap,hashpower:start+(target-start)*t}, gap=solve(p).gap;
          $('capital-gap-bar').setAttribute('d',`M310 350H${310+515*gap/10}`);
          $('capital-gap').textContent=`Expected mining gap of ${gap.toFixed(1)} minutes`;
        })
      ]);
      if(!valid())return;
      for(let i=2;i<6;i++) $(`new-machine-${i}`).style.opacity=1;
      $('tour-investor').innerHTML=investorArt('neutral');
      complete('More machines compete for the same block subsidy and fees. Each one receives less, and the expected mining gap grows from 3.2 to 8.1 minutes.');
    }
  }
  function go(index) {
    cancel();step=index;capitalStage=0;renderStep();
    MiningAudio.cue('page');
    if ($('onboarding-panel').getBoundingClientRect().top < 0) $('onboarding-panel').scrollIntoView({block:'start',behavior:'instant'});
  }
  function begin() {
    stage.parentElement.style.maxWidth=''; $('onboarding-panel').style.removeProperty('--welcome-height');
    $('intro-welcome').hidden=true; $('welcome-actions').hidden=true;
    $('tour-heading').hidden=false;$('guide').hidden=false;
    $('onboarding-panel').classList.add('tour-active'); go(0);
  }
  function leave() {
    cancel();step=-1;
    $('onboarding-panel').hidden=true;document.body.classList.remove('onboarding');
    MiningIllustration.begin();
    document.querySelector('.board').scrollIntoView({block:'start',behavior:'instant'});
    $('play-button').focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('mining:event',{detail:{type:'board'}}));
  }
  function replay() {
    if (document.body.classList.contains('onboarding')) return;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    document.body.classList.add('onboarding'); $('onboarding-panel').hidden=false;
    MiningIllustration.pause();
    document.dispatchEvent(new CustomEvent('mining:event',{detail:{type:'tour'}}));
    begin();
    scrollTo({top:0,behavior:'instant'});
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-tour-replay]'))replay();});
  $('guide-start').addEventListener('click',begin);
  $('explore-start').addEventListener('click',leave);
  $('guide-exit').addEventListener('click',leave);
  $('guide-action').addEventListener('click',action);
  $('guide-back').addEventListener('click',()=>{if(step>0)go(step-1);});
  $('guide-next').addEventListener('click',()=>{if(step===6)leave();else go(step+1);});
  document.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('onboarding'))return;
    if(e.key==='Escape') leave();
    // Arrow keys step through the tour. Right performs the pending action before moving on.
    if(step<0||e.altKey||e.ctrlKey||e.metaKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key==='ArrowRight') {
      e.preventDefault();
      if(!$('guide-next').disabled) $('guide-next').click();
      else if(!$('guide-action').hidden&&!$('guide-action').disabled) $('guide-action').click();
    }
    if(e.key==='ArrowLeft'&&!$('guide-back').disabled) {e.preventDefault();$('guide-back').click();}
  });
  document.addEventListener('visibilitychange',()=>{
    for(const a of animations) {if(document.hidden)a.pause();else a.play();}
  });
  addEventListener('resize', () => { if (step === -1 && !$('onboarding-panel').hidden) welcome(); });
  welcome();
  document.fonts?.ready.then(()=>{ if (step === -1) fitWelcome(); });
})();
