/* The fluid two-tier model from Kılıç & Akar. Time is measured in minutes.
   This file has no DOM dependencies and also runs in a plain JS test runner. */
(function (root) {
  'use strict';
  const B = 10;
  const defaults = { subsidy: 2, lowFee: 0.1, premium: 1, hashpower: 8, operating: 0.12, capital: 0.055, arrival: 0.8, capacity: 12 };
  function decayRoot(mu, arrival, capacity) {
    let lo = 0, hi = mu / arrival;
    for (let i = 0; i < 65; i++) {
      const k = (lo + hi) / 2;
      if ((mu / arrival) * -Math.expm1(-k * capacity) > k) lo = k;
      else hi = k;
    }
    return (lo + hi) / 2;
  }
  function solve(p) {
    const baseline = p.subsidy + p.capacity * p.lowFee;
    const revenue = baseline + p.premium * p.arrival * B;
    let mu = 1 / B, threshold = 0;
    if (p.operating * p.hashpower * B > baseline) {
      let lo = Math.max(1 / B, p.operating * p.hashpower / (baseline + p.capacity * p.premium));
      let hi = Math.max(lo * 2, p.operating * p.hashpower / Math.max(baseline, 0.001));
      function at(rate) {
        const s = Math.max(0, (p.operating * p.hashpower / rate - baseline) / p.premium);
        if (s >= p.capacity) return { mean: Infinity, s };
        const k = decayRoot(rate, p.arrival, p.capacity);
        return { mean: s === 0 ? 1 / rate : s / p.arrival + -Math.expm1(-k * (p.capacity - s)) / (k * p.arrival), s };
      }
      while (at(hi).mean > B) hi *= 2;
      for (let i = 0; i < 70; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid).mean > B) lo = mid; else hi = mid;
      }
      mu = (lo + hi) / 2;
      threshold = at(mu).s;
    }
    const k = decayRoot(mu, p.arrival, p.capacity);
    const active = 1 / mu;
    const unitRevenue = revenue / p.hashpower;
    const electricity = p.operating * active;
    const capital = p.capital * B;
    return { baseline, revenue, mu, w: mu / p.hashpower, threshold, k, active, gap: Math.max(0, B - active), unitRevenue, electricity, capital, profit: unitRevenue - electricity - capital, hashwork: p.hashpower / mu };
  }
  function equilibrium(p) {
    if (p.capital === 0) return null;
    let lo = 0.00001, hi = Math.max(1, p.hashpower);
    while (solve({ ...p, hashpower: hi }).profit > 0) hi *= 2;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (solve({ ...p, hashpower: mid }).profit > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // Change economic conditions without adding or removing installed machines.
  function marketConditions(p, lowCapital, lowReward) {
    return { ...p, capital: lowCapital ? 0.004 : 0.08, subsidy: lowReward ? 0.5 : 50 };
  }
  // Reference equilibria also calibrate the intentionally under-supplied opening.
  function scenario(lowCapital, lowReward, opening = false) {
    const p = marketConditions(defaults, lowCapital, lowReward);
    p.hashpower = equilibrium(p);
    if (opening) p.hashpower *= 0.5;
    return p;
  }
  function observedHistory(blocks) {
    const completed = blocks.slice(-9);
    const duration = completed.reduce((sum, r) => sum + r.end - r.start, 0);
    const idle = completed.reduce((sum, r) => sum + Math.max(0, Math.min(r.end, r.activation) - r.start), 0);
    return { count: completed.length, averageGap: completed.length ? idle / completed.length : null,
      unusedPercent: duration > 0 ? 100 * idle / duration : null };
  }
  const exponential = (rate, random) => -Math.log(Math.max(Number.MIN_VALUE, 1 - random())) / rate;
  class Simulation {
    constructor(p, random = Math.random) {
      this.p = { ...p }; this.m = solve(p); this.random = random;
      this.time = 0; this.backlog = 0; this.blocks = []; this.number = 1;
      this.earned = 0; this.electricity = 0; this.capital = 0; this.totalGap = 0; this.lastEvent = 'start';
      this.beginRound();
    }
    beginRound() {
      this.round = { number: this.number, start: this.time, initial: this.backlog };
      this.round.activation = this.time + Math.max(0, this.m.threshold - this.backlog) / this.p.arrival;
      this.round.end = this.round.activation + exponential(this.m.mu, this.random);
    }
    get active() { return this.time >= this.round.activation - 1e-9; }
    get reward() { return this.m.baseline + this.p.premium * Math.min(this.backlog, this.p.capacity); }
    nextEventTime() {
      const nextTile = (Math.floor(this.time * this.p.arrival + 1e-7) + 1) / this.p.arrival;
      return Math.min(nextTile, this.round.end, this.active ? Infinity : this.round.activation);
    }
    advance(dt) {
      const target = this.time + dt;
      const found = [];
      while (this.time < target - 1e-10) {
        const until = Math.min(target, this.round.end);
        const elapsed = until - this.time;
        const mining = Math.max(0, until - Math.max(this.time, this.round.activation));
        const h = this.p.hashpower / 5;
        this.electricity += h * this.p.operating * mining;
        this.capital += h * this.p.capital * elapsed;
        this.backlog += this.p.arrival * elapsed;
        this.time = until;
        if (this.time >= this.round.end - 1e-10) {
          const before = this.backlog;
          const reward = this.reward;
          const winner = Math.min(4, Math.floor(this.random() * 5));
          this.backlog = Math.max(0, before - this.p.capacity);
          const block = { ...this.round, before, after: this.backlog, reward, winner };
          this.blocks.push(block);
          if (this.blocks.length > 100) this.blocks.shift();
          this.totalGap += block.activation - block.start;
          if (winner === 0) this.earned += reward;
          found.push(block); this.number++; this.lastEvent = 'block'; this.beginRound();
        }
      }
      return found;
    }
  }
  root.MiningModel = { B, defaults, solve, equilibrium, scenario, marketConditions, Simulation, decayRoot, observedHistory };
})(typeof window === 'undefined' ? globalThis : window);
