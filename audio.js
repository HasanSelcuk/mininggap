(() => {
  'use strict';

  /* =================================================================
     MUSIC SETTINGS
     Change anything in this block. The engine below reads from here.

     How patterns work
       Each bar is one string. Tokens are separated by spaces, one
       token per step. With stepsPerBar: 16, each step is a sixteenth note.

         D5  F#4  Bb3   play that exact note (middle C is C4)
         1 2 3 4 5      play note n of the current chord (1 = lowest)
         C              play the whole chord except its lowest note
         -              keep holding the note before it
         .              silence

       A pattern can be one string, which repeats every bar, or a list
       of strings that cycles one bar at a time. The loop lasts until
       every list lines up again, so an 8-bar progression with a 16-bar
       melody makes a 16-bar loop.

     Live tweaking from the browser console:
       MiningAudio.configure({ tempo: 70 })
       MiningAudio.configure({ parts: { arpeggio: { on: false } } })
       MiningAudio.configure({ progression: ['Dm', 'Bb'] })
     ================================================================= */
  const MUSIC = {
    tempo: 90,                // beats per minute
    stepsPerBar: 12,           // 16 steps = sixteenth notes in 4/4
    swing: 0.33,                  // 0 is straight, 0.33 is a full shuffle
    transpose: 0,              // semitones; shifts music and sound effects together
    volume: 0.32,              // music level during normal play
    volumeWhenBlocked: 0.17,   // music level while the board is blocked
    brightness: 7000,          // Hz; tone filter on the whole music mix
    brightnessWhenBlocked: 1200,
    fadeIn: 2.0,               // seconds for the music to fade in
    humanize: { timing: 0.005, velocity: 0.12 }, // small random shifts so it feels hand played
    reverb: { seconds: 1.8, mix: 0.2 },

    // Chord voicings, lowest note first. The lowest note is the bass note.
    chords: {
      Dm: ['D3', 'A3', 'D4', 'F4', 'A4'],
      Bb: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'],
      F: ['F2', 'A3', 'C4', 'F4', 'A4'],
      C: ['C3', 'G3', 'C4', 'E4', 'G4'],
      Gm: ['G2', 'G3', 'Bb3', 'D4', 'G4'],
      A: ['A2', 'A3', 'C#4', 'E4', 'A4'],
    },

    // One chord per bar. The A major at the end pulls hard back to Dm.
    progression: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],

    // octave moves a part up or down; pan runs from -1 (left) to 1 (right);
    // strum spreads the notes of a C token apart, in seconds.
    parts: {
      kick: {
        on: true, instrument: 'thump', volume: 0.1, octave: 0, pan: 0,
        pattern: 'D2 . . . D2 . . . D2 . . . D2 . . .',
      },
      hat: {
        on: true, instrument: 'tick', volume: 0.012, octave: 0, pan: 0.2,
        pattern: [
          '. . E7 . . . E7 . . . E7 . . . E7 .',
          '. . E7 . . . E7 E7 . . E7 . . . E7 E7',
        ],
      },
      bass: {
        on: true, instrument: 'bass', volume: 0.08, octave: 0, pan: 0,
        pattern: '1 . . 1 . . 1 . 1 . . 1 . . 1 .',
      },
      pad: {
        on: true, instrument: 'pad', volume: 0.016, octave: 0, pan: 0, strum: 0.05,
        pattern: 'C - - - - - - - - - - - - - - -',
      },
      arpeggio: {
        on: true, instrument: 'pluck', volume: 0.022, octave: 0, pan: -0.3,
        pattern: [
          '2 3 4 5 2 3 4 5 2 3 4 5 2 3 4 5',
          '2 3 4 5 2 3 4 5 3 4 5 6 5 4 3 2',
        ],
      },
      melody: {
        on: true, instrument: 'lead', volume: 0.04, octave: 0, pan: 0.1,
        pattern: [
          'D5 - - A4 - - D5 - E5 - F5 - - - E5 -',     // Dm
          'D5 - - - - - - - . . . . . . . .',          // Bb
          'C5 - - A4 - - C5 - D5 - C5 - - - A4 -',     // F
          'G4 - - - - - - - . . . . E5 - D5 -',        // C
          'D5 - - A4 - - D5 - E5 - F5 - - - A5 -',     // Dm
          'G5 - - - F5 - - - D5 - - - . . . .',        // Bb
          'Bb4 - - D5 - - G5 - - - F5 - D5 - - -',     // Gm
          'C#5 - - - - - - - E5 - - - . . . .',        // A
          'A5 - - F5 - - D5 - A5 - - - G5 - F5 -',     // Dm
          'F5 - - D5 - - Bb4 - D5 - - - F5 - - -',     // Bb
          'A5 - - F5 - - C5 - A5 - - - C6 - A5 -',     // F
          'G5 - - - - - E5 - - - C5 - D5 - E5 -',      // C
          'F5 - - E5 - - D5 - A5 - - - - - - -',       // Dm
          'Bb5 - - A5 - - F5 - D5 - - - F5 - G5 -',    // Bb
          'Bb5 - - A5 - - G5 - D5 - - - G5 - Bb5 -',   // Gm
          'A5 - - - - - - - E5 - - - C#5 - - -',       // A
        ],
      },
    },
  };

  /* Each instrument stacks a few sine waves.
       partials    [frequency multiple, loudness] for each sine wave
       attack      seconds to reach full volume
       decay       seconds to settle down to the sustain level
       sustain     level held while the note lasts, from 0 to 1
       release     seconds to fade out after the note ends
       brightness  Hz where the tone starts to get muffled
       darken      how far the tone mellows as it rings (lower = mellower)
       chorus      cents of detune on two copies of the base tone, for width */
  const INSTRUMENTS = {
    piano: { partials: [[1, 1], [2, .4], [3, .14], [4, .06], [5, .02]], attack: .005, decay: 1.1, sustain: .18, release: .7, brightness: 2600, darken: .35, chorus: 2 },
    pad: { partials: [[1, 1.1], [2, .15], [3, .05]], attack: 1.2, decay: 2.5, sustain: .75, release: 2, brightness: 1300, darken: .7, chorus: 6 },
    bass: { partials: [[1, 1], [2, .5], [3, .2], [4, .08]], attack: .004, decay: .5, sustain: .3, release: .15, brightness: 900, darken: .5, chorus: 4 },
    bell: { partials: [[1, 1], [2, .25], [3.01, .12], [5.4, .04]], attack: .003, decay: 1.6, sustain: .05, release: 1.2, brightness: 4500, darken: .4, chorus: 1 },
    // A short, bright pluck for fast repeating patterns.
    pluck: { partials: [[1, 1], [2, .5], [3, .25], [4, .12], [5, .06]], attack: .002, decay: .25, sustain: .05, release: .15, brightness: 3500, darken: .25, chorus: 3 },
    // A buzzy synth lead that holds its notes.
    lead: { partials: [[1, 1], [2, .5], [3, .3], [4, .15], [5, .08], [6, .04]], attack: .01, decay: .4, sustain: .5, release: .25, brightness: 3200, darken: .6, chorus: 5 },
    // A low thump that works as a kick drum.
    thump: { partials: [[1, 1], [2, .3]], attack: .002, decay: .18, sustain: 0, release: .08, brightness: 400, darken: .3, chorus: 0 },
    // A short metallic tick that works as a hi-hat.
    tick: { partials: [[1, 1], [1.34, .8], [1.79, .6], [2.41, .5], [3.13, .3]], attack: .001, decay: .04, sustain: 0, release: .03, brightness: 12000, darken: .5, chorus: 0 },
  };

  // Sound effect notes. They follow MUSIC.transpose and stay inside D minor.
  const EFFECTS = {
    volume: 0.42,
    tile: ['D5', 'E5', 'F5'],         // a transaction tile lands; the variation number picks one
    reserve: 'A3',                    // a replaced low-fee tile drops into the reserve
    win: ['A4', 'D5', 'F5', 'A5'],    // our miner finds the block; played upward with a coin
    block: ['F4', 'D4'],              // another miner finds the block; a soft fall
    page: 'A4',                       // tour page turn
    start: 'A2',                      // a machine switches on; slides up 7 semitones
    subsidy: ['F4', 'A4', 'D5'],
    cost: 'A4',                       // slides down 3 semitones
    invest: 'D4',                     // climbs 2 semitones per variation step
    settle: ['D4', 'F4', 'A4', 'D5'], // the market settles; a gentle strum
    hint: ['A5', 'D6'],               // a tip appears
    toggle: ['D5', 'A4'],             // a switch turns on or off
    slider: ['D', 'E', 'F', 'G', 'A', 'C'], // scale for slider ticks, spread over two octaves
  };

  /* =================================================================
     ENGINE. You should not need to edit below this line.
     ================================================================= */
  const storageKey = 'mining-gaps-audio';
  const preference = { music: true, effects: true };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    for (const key of Object.keys(preference)) if (typeof saved?.[key] === 'boolean') preference[key] = saved[key];
  } catch (_) { /* Storage is optional, including when opened as a local file. */ }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const buttons = { music: document.getElementById('audio-music'), effects: document.getElementById('audio-effects') };
  let context, master, musicBus, musicFilter, reverb, reverbReturn, effectsBus, fanBus, noiseBuffer;
  let unlocked = false, blocked = false, fanWanted = false, fan = null, timer = null;
  let nextEvent = 0, loopStart = 0, resumePending = null, activeCue = '';
  let score = { events: [], length: 0 };
  const voices = { music: new Set(), effects: new Set() };
  const lastCue = new Map();
  const warned = new Set();
  const LOOKAHEAD = .3, MAX_VOICES = { music: 90, effects: 64 };

  function warnOnce(message) {
    if (warned.has(message)) return;
    warned.add(message);
    console.warn(`[audio] ${message}`);
  }

  // ---------- Notes and patterns ----------
  const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteNumber(name) {
    const match = /^([A-G])(#|b)?(-?\d)$/.exec(String(name).trim());
    if (!match) return null;
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return 12 * (Number(match[3]) + 1) + LETTERS[match[1]] + accidental;
  }
  function effectNote(name) {
    const note = noteNumber(name);
    if (note === null) { warnOnce(`Cannot read effect note "${name}".`); return 69 + MUSIC.transpose; }
    return note + MUSIC.transpose;
  }
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

  function chordNotes(name) {
    const chord = MUSIC.chords[name];
    if (!chord) { warnOnce(`Unknown chord "${name}" in the progression.`); return []; }
    return chord.map(noteNumber).filter(note => note !== null);
  }
  function resolve(token, chord) {
    if (token === 'C') return chord.slice(1);
    if (/^\d+$/.test(token)) {
      const index = Number(token) - 1;
      if (!chord.length || index < 0) return [];
      // Numbers past the top of the chord wrap around an octave higher.
      return [chord[index % chord.length] + 12 * Math.floor(index / chord.length)];
    }
    const note = noteNumber(token);
    if (note === null) { warnOnce(`Cannot read "${token}". Use a note like F#4, a chord number, C, - or .`); return []; }
    return [note];
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const asList = pattern => Array.isArray(pattern) ? pattern : [pattern];

  function buildScore() {
    const steps = MUSIC.stepsPerBar;
    const stepLength = 60 / MUSIC.tempo / (steps / 4);
    const parts = Object.entries(MUSIC.parts).filter(([, part]) => part && part.on !== false);
    let bars = Math.max(1, MUSIC.progression.length);
    for (const [, part] of parts) {
      const count = asList(part.pattern).length;
      bars = bars * count / gcd(bars, count);
    }
    bars = Math.min(bars, 256);
    const at = step => step * stepLength + (step % 2 ? MUSIC.swing * stepLength : 0);
    const notes = [];
    for (const [name, part] of parts) {
      const patterns = asList(part.pattern);
      const shift = 12 * (part.octave || 0) + MUSIC.transpose;
      let held = null;
      for (let bar = 0; bar < bars; bar++) {
        const chord = chordNotes(MUSIC.progression[bar % MUSIC.progression.length]);
        const tokens = String(patterns[bar % patterns.length]).trim().split(/\s+/);
        if (tokens.length !== steps) warnOnce(`Part "${name}" has a bar with ${tokens.length} steps; expected ${steps}.`);
        for (let step = 0; step < steps; step++) {
          const token = tokens[step] ?? '.', index = bar * steps + step;
          if (token === '-') { if (held) held.end = index + 1; continue; }
          held = null;
          if (token === '.') continue;
          const pitches = resolve(token, chord).map(note => note + shift);
          if (!pitches.length) continue;
          held = { start: index, end: index + 1, pitches, part };
          notes.push(held);
        }
      }
    }
    const events = notes.map(note => ({
      time: at(note.start),
      duration: at(note.end) - at(note.start),
      notes: note.pitches,
      instrument: note.part.instrument || 'piano',
      level: note.part.volume ?? .04,
      pan: note.part.pan ?? 0,
      strum: note.pitches.length > 1 ? (note.part.strum ?? .025) : 0,
    })).sort((a, b) => a.time - b.time);
    return { events, length: bars * steps * stepLength };
  }

  // ---------- Audio graph ----------
  function smooth(param, value, duration = .08) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, duration);
  }
  function makeImpulse(seconds) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return impulse;
  }
  function makeContext() {
    context = new AudioContext();
    master = context.createGain(); master.gain.value = .8;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -15; limiter.knee.value = 18; limiter.ratio.value = 4;
    master.connect(limiter); limiter.connect(context.destination);

    musicBus = context.createGain(); musicBus.gain.value = 0;
    musicFilter = context.createBiquadFilter();
    musicFilter.type = 'lowpass'; musicFilter.frequency.value = MUSIC.brightness; musicFilter.Q.value = .4;
    musicBus.connect(musicFilter); musicFilter.connect(master);
    reverb = context.createConvolver(); reverb.buffer = makeImpulse(MUSIC.reverb.seconds);
    reverbReturn = context.createGain(); reverbReturn.gain.value = MUSIC.reverb.mix;
    musicFilter.connect(reverb); reverb.connect(reverbReturn); reverbReturn.connect(master);

    effectsBus = context.createGain(); effectsBus.gain.value = preference.effects ? EFFECTS.volume : 0; effectsBus.connect(master);
    fanBus = context.createGain(); fanBus.gain.value = 0; fanBus.connect(master);

    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 1831;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
  }

  // ---------- Music voices ----------
  function playNote(midi, time, length, level, instrumentName, pan = 0) {
    if (voices.music.size >= MAX_VOICES.music) return;
    let sound = INSTRUMENTS[instrumentName];
    if (!sound) { warnOnce(`Unknown instrument "${instrumentName}"; using piano.`); sound = INSTRUMENTS.piano; }
    const end = Math.max(time + length, time + sound.attack);
    const stop = end + sound.release * 1.5 + .05;
    const filter = context.createBiquadFilter(), gain = context.createGain(), nodes = [filter, gain];
    // Higher notes get a little brighter, like a real instrument.
    const tone = Math.min(16000, sound.brightness * 2 ** ((midi - 60) / 24));
    filter.type = 'lowpass'; filter.Q.value = .3;
    filter.frequency.setValueAtTime(tone, time);
    filter.frequency.setTargetAtTime(Math.max(100, tone * sound.darken), time, sound.decay / 3);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + sound.attack);
    gain.gain.setTargetAtTime(level * sound.sustain, time + sound.attack, sound.decay / 3);
    gain.gain.setTargetAtTime(0, end, sound.release / 3);
    filter.connect(gain);
    let output = gain;
    if (pan && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner); nodes.push(panner); output = panner;
    }
    output.connect(musicBus);
    const sources = [];
    for (const [ratio, weight] of sound.partials) {
      const spread = ratio === 1 && sound.chorus ? [-sound.chorus, sound.chorus] : [0];
      for (const cents of spread) {
        const osc = context.createOscillator(), partGain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency(midi) * ratio;
        osc.detune.value = cents;
        partGain.gain.value = weight / spread.length;
        osc.connect(partGain); partGain.connect(filter);
        osc.start(time); osc.stop(stop);
        sources.push(osc); nodes.push(partGain);
      }
    }
    const voice = { sources, gain };
    voices.music.add(voice);
    sources[sources.length - 1].onended = () => {
      for (const node of [...sources, ...nodes]) node.disconnect();
      voices.music.delete(voice);
    };
  }
  function playEvent(event, time) {
    const { timing = 0, velocity = 0 } = MUSIC.humanize || {};
    const now = context.currentTime;
    event.notes.forEach((note, i) => {
      const jitter = (Math.random() * 2 - 1) * timing;
      const start = Math.max(now, time + i * event.strum + jitter);
      const level = Math.max(0, event.level * (1 + (Math.random() * 2 - 1) * velocity));
      playNote(note, start, Math.max(.05, event.duration - i * event.strum), level, event.instrument, event.pan);
    });
  }

  // ---------- Sound effects ----------
  // Partial sets for effect tones. A bell has slightly inharmonic overtones, like a coin.
  const TIMBRES = {
    soft: [[1, 1], [2, .08]],
    clear: [[1, 1], [2, .18], [3, .035]],
    bell: [[1, 1], [2.76, .22], [5.4, .06]],
  };
  function blip(midi, time, duration, level, soft = false, slide = 0, timbre) {
    if (voices.effects.size > MAX_VOICES.effects) return;
    const gain = context.createGain();
    gain.connect(effectsBus);
    const attack = soft ? .12 : timbre === 'bell' ? .003 : .012;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    const parts = TIMBRES[timbre] || (soft ? TIMBRES.soft : TIMBRES.clear);
    const sources = parts.map(([partial, weight]) => {
      const source = context.createOscillator(), partialGain = context.createGain();
      source.type = 'sine'; source.frequency.setValueAtTime(frequency(midi) * partial, time);
      if (slide) source.frequency.exponentialRampToValueAtTime(frequency(midi + slide) * partial, time + duration * .65);
      partialGain.gain.value = weight;
      source.connect(partialGain); partialGain.connect(gain);
      source.start(time); source.stop(time + duration + .03);
      source.onended = () => { source.disconnect(); partialGain.disconnect(); };
      return source;
    });
    const voice = { sources, gain, ui: INTERFACE_CUES.has(activeCue) };
    voices.effects.add(voice);
    const last = sources.at(-1), cleanup = last.onended;
    last.onended = () => { cleanup(); gain.disconnect(); voices.effects.delete(voice); };
  }
  // A short filtered noise burst. With sweepTo, the filter glides like paper sliding.
  function tap(pitch = 900, level = .13, length = .075, sweepTo = 0, delay = 0) {
    if (voices.effects.size > MAX_VOICES.effects) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noiseBuffer; filter.type = 'bandpass'; filter.Q.value = sweepTo ? .9 : 1.5;
    source.connect(filter); filter.connect(gain); gain.connect(effectsBus);
    const now = context.currentTime + delay;
    filter.frequency.setValueAtTime(pitch, now);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, now + length);
    const attack = sweepTo ? length * .35 : .004;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(level, now + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, now + length);
    const voice = { sources: [source], gain, ui: INTERFACE_CUES.has(activeCue) }; voices.effects.add(voice);
    source.start(now, Math.random() * .5); source.stop(now + length + .01);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); voices.effects.delete(voice); };
  }
  // Maps 0..1 onto the slider scale, so dragging plays a quiet rising or falling scale.
  function sliderNote(fraction) {
    const scale = EFFECTS.slider, steps = scale.length * 2;
    const index = Math.round(Math.max(0, Math.min(1, fraction)) * (steps - 1));
    return effectNote(`${scale[index % scale.length]}${4 + Math.floor(index / scale.length)}`);
  }
  function stopVoices(group, keepInterface = false) {
    if (!context) return;
    for (const voice of voices[group]) {
      if (keepInterface && voice.ui) continue;
      smooth(voice.gain.gain, 0, .008);
      for (const source of voice.sources) {
        try { source.stop(context.currentTime + .04); } catch (_) { /* Already finished. */ }
      }
      voices[group].delete(voice);
    }
  }
  function available() { return context && unlocked && context.state === 'running' && !document.hidden; }
  // Minimum seconds between two cues of the same kind, so fast playback stays calm.
  const CUE_GAP = { tile: .14, reserve: .14, block: .5, slider: .05, hint: .4, settle: .6, open: .2 };
  // Cues that dialogs and paused playback must not silence.
  const INTERFACE_CUES = new Set(['tap', 'slider', 'toggle', 'open', 'hint']);
  function cue(name, variation = 0) {
    if (!available() || !preference.effects || (blocked && !INTERFACE_CUES.has(name))) return;
    const now = context.currentTime;
    if (now - (lastCue.get(name) ?? -Infinity) < (CUE_GAP[name] ?? .08)) return;
    lastCue.set(name, now);
    activeCue = name;
    try { play(name, variation, now); } finally { activeCue = ''; }
  }
  function play(name, variation, now) {
    if (name === 'tap') tap(850, .07);
    if (name === 'page') { tap(1400, .05, .2, 500); blip(effectNote(EFFECTS.page), now + .04, .22, .04); }
    if (name === 'open') tap(600, .035, .16, 2200);
    if (name === 'tile') {
      tap(1100, .09);
      blip(effectNote(EFFECTS.tile[Math.abs(variation) % EFFECTS.tile.length]), now, .19, .065);
    }
    if (name === 'reserve') { tap(420, .07, .09); blip(effectNote(EFFECTS.reserve), now, .16, .035, false, -2); }
    if (name === 'block' && variation === 1) {
      // Our miner wins: a rising arpeggio, then two coins.
      EFFECTS.win.forEach((note, i) => blip(effectNote(note), now + i * .08, .7, .085));
      blip(effectNote(EFFECTS.win.at(-1)) + 12, now + .36, .5, .03, false, 0, 'bell');
      blip(effectNote(EFFECTS.win.at(-1)) + 7, now + .44, .45, .025, false, 0, 'bell');
    } else if (name === 'block') {
      // Another miner wins: the block still clears, so the fall stays gentle.
      tap(380, .09, .1);
      EFFECTS.block.forEach((note, i) => blip(effectNote(note), now + i * .13, .5, .06, i > 0));
    }
    if (name === 'start') { tap(340, .14); blip(effectNote(EFFECTS.start), now, .45, .08, true, 7); }
    if (name === 'subsidy') EFFECTS.subsidy.forEach((note, i) => blip(effectNote(note), now + i * .1, .55, .065));
    if (name === 'cost') { tap(700, .085); blip(effectNote(EFFECTS.cost), now, .3, .05, false, -3); }
    if (name === 'invest') { tap(450, .12); blip(effectNote(EFFECTS.invest) + variation * 2, now, .28, .07); }
    if (name === 'settle') EFFECTS.settle.forEach((note, i) => blip(effectNote(note), now + i * .045, 1.1, .04, i === 0));
    if (name === 'hint') EFFECTS.hint.forEach((note, i) => blip(effectNote(note), now + i * .07, .5, .022, false, 0, 'bell'));
    if (name === 'toggle') {
      const [up, down] = EFFECTS.toggle;
      tap(variation ? 1200 : 700, .06);
      blip(effectNote(variation ? up : down), now, .16, .04);
    }
    if (name === 'slider') blip(sliderNote(variation), now, .08, .022);
  }

  // ---------- Machine fan ----------
  // Filtered noise for air plus two close sines for the motor. Both glide up on start and down on stop.
  function refreshFan() {
    if (!context) return;
    const audible = available() && preference.effects && fanWanted && !blocked;
    const now = context.currentTime;
    if (audible && !fan) {
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), hum = context.createGain();
      source.buffer = noiseBuffer; source.loop = true;
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(140, now);
      filter.frequency.setTargetAtTime(420, now, .25);
      source.connect(filter); filter.connect(fanBus); source.start();
      hum.gain.value = .1; hum.connect(fanBus);
      const base = frequency(effectNote('D3'));
      const motors = [0, .8].map(offset => {
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * .6 + offset, now);
        osc.frequency.setTargetAtTime(base + offset, now, .3);
        osc.connect(hum); osc.start();
        return osc;
      });
      fan = { source, filter, hum, motors };
    }
    smooth(fanBus.gain, audible ? .025 : 0, audible ? .15 : .22);
    if (!audible && fan) {
      const old = fan; fan = null;
      old.filter.frequency.cancelScheduledValues(now);
      old.filter.frequency.setTargetAtTime(120, now, .25);
      for (const osc of old.motors) {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setTargetAtTime(osc.frequency.value * .55, now, .3);
        osc.stop(now + 1.1);
      }
      old.source.stop(now + 1.1);
      old.source.onended = () => {
        for (const node of [old.source, old.filter, old.hum, ...old.motors]) node.disconnect();
      };
    }
  }
  function machine(value) {
    if (fanWanted === value) return;
    fanWanted = value;
    refreshFan();
  }

  // ---------- Scheduler ----------
  const musicLevel = () => blocked ? MUSIC.volumeWhenBlocked : MUSIC.volume;
  const musicTone = () => blocked ? MUSIC.brightnessWhenBlocked : MUSIC.brightness;
  function schedule() {
    if (!available() || !preference.music || !score.events.length) return;
    const now = context.currentTime, events = score.events;
    // Start a fresh pass if a background timer fell far behind.
    if (loopStart + events[nextEvent].time < now - .5) { loopStart = now + .08; nextEvent = 0; }
    while (loopStart + events[nextEvent].time < now + LOOKAHEAD) {
      const event = events[nextEvent];
      playEvent(event, Math.max(now, loopStart + event.time));
      nextEvent++;
      if (nextEvent === events.length) { nextEvent = 0; loopStart += score.length; }
    }
  }
  function startMusic() {
    if (!available() || !preference.music || timer || !score.events.length) return;
    loopStart = context.currentTime + .1; nextEvent = 0;
    smooth(musicBus.gain, musicLevel(), MUSIC.fadeIn / 3);
    smooth(musicFilter.frequency, musicTone(), .2);
    schedule(); timer = setInterval(schedule, 100);
  }
  function stopMusic() {
    clearInterval(timer); timer = null;
    if (context) { smooth(musicBus.gain, 0, .05); stopVoices('music'); }
  }
  async function unlock() {
    if (!AudioContext) return;
    try {
      if (!context) makeContext();
      unlocked = true;
      if (context.state !== 'running') {
        if (!resumePending) resumePending = context.resume().finally(() => { resumePending = null; });
        await resumePending;
      }
      if (document.hidden) return;
      startMusic(); refreshFan();
    } catch (_) { /* Audio failure must never interrupt the illustration. */ }
  }
  // Restarts silence the illustration's sounds. Clicks, switches and slider ticks finish naturally.
  function resetEffects() {
    machine(false); stopVoices('effects', true);
    for (const name of lastCue.keys()) if (!INTERFACE_CUES.has(name)) lastCue.delete(name);
  }
  function setBlocked(value) {
    if (blocked === value) return;
    blocked = value;
    if (context) {
      smooth(musicBus.gain, preference.music && timer ? musicLevel() : 0, .2);
      smooth(musicFilter.frequency, musicTone(), .3);
      if (blocked) stopVoices('effects', true);
      refreshFan();
    }
  }

  // Merge new settings and restart the loop. Lists replace; objects merge.
  function configure(changes = {}) {
    const { parts, chords, instruments, effects, humanize, reverb: reverbChanges, ...rest } = changes;
    Object.assign(MUSIC, rest);
    if (chords) Object.assign(MUSIC.chords, chords);
    if (humanize) Object.assign(MUSIC.humanize, humanize);
    if (reverbChanges) Object.assign(MUSIC.reverb, reverbChanges);
    if (parts) for (const [name, part] of Object.entries(parts)) MUSIC.parts[name] = { ...MUSIC.parts[name], ...part };
    if (instruments) for (const [name, sound] of Object.entries(instruments)) INSTRUMENTS[name] = { ...INSTRUMENTS.piano, ...INSTRUMENTS[name], ...sound };
    if (effects) Object.assign(EFFECTS, effects);
    warned.clear();
    score = buildScore();
    if (context) {
      if (reverbChanges?.seconds) reverb.buffer = makeImpulse(MUSIC.reverb.seconds);
      smooth(reverbReturn.gain, MUSIC.reverb.mix, .1);
      smooth(effectsBus.gain, preference.effects ? EFFECTS.volume : 0, .05);
    }
    if (timer) { stopMusic(); startMusic(); }
  }

  // ---------- Buttons and page events ----------
  function updateButtons() {
    for (const [key, button] of Object.entries(buttons)) {
      if (!button) continue;
      button.setAttribute('aria-pressed', String(preference[key]));
      button.querySelector('span').textContent = `${key === 'music' ? 'Music' : 'Sounds'} ${preference[key] ? 'on' : 'off'}`;
      button.title = `${preference[key] ? 'Mute' : 'Enable'} ${key === 'music' ? 'background music' : 'sound effects'}`;
      if (!AudioContext) { button.disabled = true; button.title = 'Audio is unavailable in this browser'; }
    }
  }
  for (const [key, button] of Object.entries(buttons)) button?.addEventListener('click', async () => {
    preference[key] = !preference[key];
    try { localStorage.setItem(storageKey, JSON.stringify(preference)); } catch (_) { /* Optional. */ }
    if (key === 'music' && !preference.music) stopMusic();
    if (key === 'effects' && context) {
      smooth(effectsBus.gain, preference.effects ? EFFECTS.volume : 0, .02);
      if (!preference.effects) stopVoices('effects');
      refreshFan();
    }
    updateButtons(); await unlock();
    if (key === 'effects' && preference.effects) cue('tap');
  });
  // Browsers allow sound only after the visitor interacts with the page. Music starts
  // on the first press or key anywhere. Where the browser allows autoplay, it starts on load.
  function firstGesture(event) {
    if (!event.isTrusted || event.target.closest?.('.audio-controls')) return;
    // Not every event counts as a gesture, so listening continues until audio runs.
    if (unlocked && context?.state === 'running') {
      for (const type of GESTURES) document.removeEventListener(type, firstGesture, true);
      return;
    }
    unlock();
  }
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  for (const type of GESTURES) document.addEventListener(type, firstGesture, true);
  function tryAutoplay() {
    if (!AudioContext || document.hidden || !(preference.music || preference.effects)) return;
    try {
      if (!context) makeContext();
      if (context.state === 'running') { unlocked = true; startMusic(); return; }
      // Without permission the context stays suspended until the first gesture.
      context.addEventListener('statechange', function started() {
        if (context.state !== 'running') return;
        context.removeEventListener('statechange', started);
        unlocked = true; startMusic(); refreshFan();
      });
      context.resume().catch(() => {});
    } catch (_) { /* Audio failure must never interrupt the illustration. */ }
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || event.target.closest('.audio-controls')) return;
    const control = event.target.closest('button, input, select, summary');
    if (!control || control.disabled) return;
    unlock().then(() => { if (!document.hidden) cue('tap'); });
  }, true);
  document.addEventListener('keydown', event => {
    if (event.isTrusted && !event.repeat && ['Space', 'Enter'].includes(event.code) && !event.target.closest('.audio-controls')) unlock();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.hidden) {
      stopMusic(); stopVoices('effects');
      context.suspend().catch(() => {});
    } else if (unlocked) unlock();
  });
  window.addEventListener('pagehide', () => { stopMusic(); resetEffects(); context?.suspend().catch(() => {}); });
  window.addEventListener('pageshow', () => { if (unlocked && !document.hidden) unlock(); });

  score = buildScore();
  window.MiningAudio = {
    unlock, cue, machine, resetEffects, setBlocked, configure,
    settings: { music: MUSIC, instruments: INSTRUMENTS, effects: EFFECTS },
  };
  updateButtons();
  tryAutoplay();
})();