import type { Input, TouchDir } from '../game/Input';
import type { RunStats, ScoreBreakdown } from '../game/Scoring';
import type { LevelDef } from '../game/Levels';
import { PERFECT_ATTEMPTS } from '../game/Scoring';
import { formatTime } from '../util/math';
import type { Campaign, CampaignId } from '../game/Campaign';
import { CAMPAIGNS } from '../game/Campaign';

/** A body piece just won (results screen). */
export interface PieceReward {
  label: string;
  emoji: string;
  /** Monster so far, as an image URL (null without WebGL). */
  image: string | null;
  filled: number;
  total: number;
}

/** The monster so far, for the pause menu. */
export interface PauseMonster {
  image: string | null;
  filled: number;
  total: number;
  parts: string[];
}

export interface PauseMenu {
  current: number;
  levels: { index: number; name: string; unlocked: boolean }[];
  monster?: PauseMonster;
  onResume: () => void;
  onRestart: () => void;
  onJump: (index: number) => void;
}

/** The finished monster (final screen). */
export interface MonsterFinal {
  image: string | null;
  defaultName: string;
  parts: string[];
  onShare: (name: string) => Promise<string>;
  onDownload: (name: string) => Promise<void>;
}

export interface TargetCard { kind: string; name: string; icon: string; isImage: boolean }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** DOM overlay: timer, attempts, target cards, banners, intro/results, touch pad. */
export class Hud {
  private hud = document.getElementById('hud')!;
  private overlay = document.getElementById('overlay')!;
  private touch = document.getElementById('touch-controls')!;
  private timerEl: HTMLElement;
  private attemptsEl: HTMLElement;
  private levelEl: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerSub: HTMLElement;
  private targetsEl: HTMLElement;
  private toastHost: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private lastTimer = '';
  private pauseBtn: HTMLButtonElement;
  /** Set by the game: the ⏸ button was pressed. */
  onPause: (() => void) | null = null;

  constructor(input: Input) {
    const top = el('div', 'hud-top');
    const stats = el('div', 'hud-stats');
    this.timerEl = el('div', 'pill', '<span class="ico">⏱</span><span class="val">0:00</span>');
    this.attemptsEl = el('div', 'pill', '<span class="ico">🕹</span><span class="val">0</span>');
    this.levelEl = el('div', 'pill level', '<span class="val">Lv 1 · Meadow</span>');
    this.pauseBtn = el('button', 'pill pause-btn hidden', '⏸');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.onPause?.(); });
    stats.append(this.levelEl, this.timerEl, this.attemptsEl, this.pauseBtn);
    const banner = el('div', 'banner');
    this.bannerEl = el('div', 'banner-title');
    this.bannerSub = el('div', 'banner-sub');
    banner.append(this.bannerEl, this.bannerSub);
    this.targetsEl = el('div', 'targets hidden');
    top.append(stats, banner, this.targetsEl);
    this.toastHost = el('div', 'toasts');
    this.hud.append(top, this.toastHost);

    this.buildTouch(input);
  }

  private buildTouch(input: Input): void {
    const pad = el('div', 'dpad');
    const mk = (dir: TouchDir, cls: string, label: string) => {
      const b = el('button', `tbtn ${cls}`, label);
      b.setAttribute('aria-label', dir);
      const down = (e: PointerEvent) => { e.preventDefault(); b.setPointerCapture(e.pointerId); input.setTouch(dir, true); b.classList.add('active'); };
      const up = () => { input.setTouch(dir, false); b.classList.remove('active'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    pad.append(mk('up', 'up', '▲'), mk('left', 'left', '◀'), mk('right', 'right', '▶'), mk('down', 'down', '▼'));
    const rot = el('div', 'rotpad');
    rot.append(mk('rotl', 'rotl', '↺'), mk('rotr', 'rotr', '↻'));
    this.touch.append(rot);
    const drop = el('button', 'tbtn drop', 'DROP');
    drop.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressDrop(); drop.classList.add('active'); });
    const rel = () => drop.classList.remove('active');
    drop.addEventListener('pointerup', rel);
    drop.addEventListener('pointercancel', rel);
    drop.addEventListener('contextmenu', (e) => e.preventDefault());
    this.touch.append(pad, drop);
  }

  setLevel(def: LevelDef): void {
    this.levelEl.querySelector('.val')!.textContent = `Lv ${def.index + 1} · ${def.name}`;
    this.levelEl.classList.remove('pop');
    void this.levelEl.offsetWidth;
    this.levelEl.classList.add('pop');
  }

  setTimer(seconds: number): void {
    const s = formatTime(seconds);
    if (s !== this.lastTimer) {
      this.lastTimer = s;
      this.timerEl.querySelector('.val')!.textContent = s;
    }
  }

  setAttempts(n: number): void {
    this.attemptsEl.querySelector('.val')!.textContent = String(n);
    this.attemptsEl.classList.remove('pop');
    void this.attemptsEl.offsetWidth;
    this.attemptsEl.classList.add('pop');
  }

  setBanner(title: string, sub = ''): void {
    this.bannerEl.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.parentElement!.classList.toggle('hidden', title === '');
    this.bannerEl.parentElement!.classList.remove('pop');
    void this.bannerEl.offsetWidth;
    this.bannerEl.parentElement!.classList.add('pop');
  }

  setTargets(cards: TargetCard[]): void {
    this.targetsEl.innerHTML = '<div class="targets-title">Find &amp; drop in the hole</div>';
    this.cards.clear();
    for (const c of cards) {
      const card = el('div', 'card');
      const icon = c.isImage ? `<img src="${c.icon}" alt="${c.name}" />` : `<span class="emoji">${c.icon}</span>`;
      card.innerHTML = `<div class="card-icon">${icon}<div class="check">✓</div></div><div class="card-name">${c.name}</div>`;
      this.targetsEl.append(card);
      this.cards.set(c.kind, card);
    }
  }

  showTargets(visible: boolean): void {
    this.targetsEl.classList.toggle('hidden', !visible);
  }

  markDelivered(kind: string): void {
    const c = this.cards.get(kind);
    if (!c) return;
    c.classList.add('done');
  }

  toast(text: string, cls = ''): void {
    const t = el('div', `toast ${cls}`, text);
    this.toastHost.append(t);
    setTimeout(() => t.remove(), 1600);
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }

  showIntro(
    campaign: Campaign, onStart: () => void, resume?: { level: LevelDef; onResume: () => void; pieces?: number },
    onSwitch?: (id: CampaignId) => void,
  ): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const card = el('div', 'panel intro');
    const spooky = campaign.rewardsPieces;
    if (onSwitch) {
      const tabs = el('div', 'campaign-tabs');
      for (const c of Object.values(CAMPAIGNS)) {
        const t = el('button', `campaign-tab ${c.id === campaign.id ? 'on' : ''}`, c.tab);
        t.addEventListener('click', (e) => { e.stopPropagation(); if (c.id !== campaign.id) onSwitch(c.id); });
        tabs.append(t);
      }
      card.append(tabs);
    }
    const body = el('div');
    body.innerHTML = `
      <div class="title">${campaign.title}</div>
      <div class="subtitle">${campaign.subtitle}</div>
      <ol class="howto">
        <li><b>1.</b> Every island hides <b>treasures</b>. Drop them into the hatch.</li>
        <li><b>2.</b> The hatch is shut tight&hellip; find a way to open it.</li>
        ${spooky
    ? '<li><b>3.</b> Clear an island to win a <b>body piece</b> from a random monster. Ten pieces make your own <b>Frankenstein</b>. 🧟</li>'
    : '<li><b>3.</b> Grab things dead centre. A sloppy grip wobbles, then slips.</li>'}
      </ol>
      <div class="keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>←</kbd><kbd>→</kbd> rotate</span>
        <span><kbd>Space</kbd> drop · drop again to release</span>
      </div>
    `;
    card.append(body);
    const btns = el('div', 'btns');
    const btn = el('button', 'big-btn', resume ? 'New game' : 'Start');
    btn.addEventListener('click', onStart);
    btns.append(btn);
    if (resume) {
      const pieces = spooky && resume.pieces ? ` · ${resume.pieces}🦴` : '';
      const r = el('button', 'big-btn alt', `Continue · Lv ${resume.level.index + 1}${pieces}`);
      r.addEventListener('click', resume.onResume);
      btns.append(r);
    }
    card.append(btns);
    card.append(el('div', 'hint', resume ? 'press any key for a new game' : 'press any key or tap to start'));
    this.overlay.append(card);
  }

  setPauseVisible(visible: boolean): void {
    if (this.pauseBtn.classList.contains('hidden') === !visible) return;
    this.pauseBtn.classList.toggle('hidden', !visible);
  }

  showPause(m: PauseMenu): void {
    this.setPauseVisible(false);
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const card = el('div', 'panel pause');
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.innerHTML = `<div class="title">Paused${m.monster ? ' 🦇' : ''}</div>`;
    const resume = el('button', 'big-btn', 'Resume ▶');
    resume.addEventListener('click', m.onResume);
    const top = el('div', 'btns');
    top.append(resume);
    card.append(top);
    if (m.monster) {
      const box = el('div', 'piece pause-monster');
      const pic = m.monster.image ? `<img class="piece-monster" src="${m.monster.image}" alt="Your monster so far" />` : '<div class="piece-emoji">🧟</div>';
      const dots = Array.from({ length: m.monster.total }, (_, i) => `<i class="${i < m.monster!.filled ? 'on' : ''}"></i>`).join('');
      const parts = m.monster.parts.length ? m.monster.parts.map((p) => `<span>${p}</span>`).join('') : '<span>No pieces yet: clear an island!</span>';
      box.innerHTML = `${pic}<div class="piece-text"><div class="piece-kicker">Your monster</div><div class="piece-dots">${dots}</div><div class="piece-count">${m.monster.filled} / ${m.monster.total} pieces</div><div class="parts">${parts}</div></div>`;
      card.append(box);
    }
    const restart = el('button', 'big-btn alt small', '↻ Restart island');
    restart.addEventListener('click', m.onRestart);
    const mid = el('div', 'btns');
    mid.append(restart);
    card.append(mid);
    card.append(el('div', 'grid-title', 'Islands'));
    const grid = el('div', 'level-grid');
    for (const lv of m.levels) {
      const b = el('button', `level-btn${lv.index === m.current ? ' current' : ''}${lv.unlocked ? '' : ' locked'}`,
        lv.unlocked ? `<b>${lv.index + 1}</b> ${lv.name}` : `<b>${lv.index + 1}</b> 🔒`);
      b.disabled = !lv.unlocked;
      if (lv.unlocked) b.addEventListener('click', () => m.onJump(lv.index));
      grid.append(b);
    }
    card.append(grid);
    card.append(el('div', 'hint', 'Esc · resume'));
    this.overlay.append(card);
  }

  private starsEl(count: number, onStarSound: () => void): HTMLElement {
    const stars = el('div', 'stars');
    for (let i = 0; i < 3; i++) {
      const st = el('div', `star ${i < count ? 'lit' : ''}`, '★');
      st.style.animationDelay = `${0.3 + i * 0.18}s`;
      stars.append(st);
      if (i < count) setTimeout(onStarSound, 300 + i * 180);
    }
    return stars;
  }

  private countUp(target: HTMLElement, value: number, delay = 500): void {
    const start = performance.now() + delay;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - start) / 1000));
      target.textContent = String(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  showLevelResults(
    level: LevelDef, b: ScoreBreakdown, stats: RunStats, isLast: boolean, onContinue: () => void, onStarSound: () => void, piece?: PieceReward,
  ): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const card = el('div', 'panel results');
    const perfect = stats.attempts <= PERFECT_ATTEMPTS ? ' <span class="badge">perfect</span>' : '';
    card.innerHTML = `<div class="title">Level ${level.index + 1} clear!</div><div class="subtitle">${level.name}</div>`;
    card.append(this.starsEl(b.stars, onStarSound));
    if (piece) card.append(this.pieceEl(piece));
    const rows = el('div', 'rows');
    rows.innerHTML = `
      <div class="row"><span>Time</span><b>${formatTime(stats.seconds)}</b></div>
      <div class="row"><span>Attempts</span><b>${stats.attempts}${perfect}</b></div>
      <div class="row"><span>Slips</span><b>${stats.slips}</b></div>
      <div class="row"><span>Wrong drops</span><b>${stats.decoysDropped}</b></div>
      <div class="sep"></div>
      <div class="row"><span>Treasures</span><b>+${b.base}</b></div>
      <div class="row"><span>Time bonus</span><b>+${b.timeBonus}</b></div>
      <div class="row"><span>Precision bonus</span><b>+${b.attemptBonus}</b></div>
      <div class="row"><span>Penalty</span><b>-${b.decoyPenalty}</b></div>
      <div class="row total"><span>Score</span><b class="total-val">0</b></div>
    `;
    card.append(rows);
    const btns = el('div', 'btns');
    const cont = el('button', 'big-btn', isLast ? (piece ? 'It\'s alive! ⚡' : 'See final score') : 'Continue ▶');
    cont.addEventListener('click', onContinue);
    btns.append(cont);
    card.append(btns);
    card.append(el('div', 'hint', isLast ? (piece ? 'Enter · bring your monster to life' : 'Enter · final score') : 'Enter · ride to the next island'));
    this.overlay.append(card);
    this.countUp(rows.querySelector<HTMLElement>('.total-val')!, b.total);
  }

  showFinal(
    results: { level: LevelDef; breakdown: ScoreBreakdown; stats: RunStats }[],
    total: number, stars: number, best: number, onReplay: () => void, onStarSound: () => void,
  ): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const card = el('div', 'panel results final');
    card.innerHTML = `<div class="title">All clear!</div><div class="subtitle">every treasure on every island</div>`;
    card.append(this.starsEl(stars, onStarSound));
    const table = el('div', 'table');
    table.innerHTML = `<div class="trow head"><span>Island</span><span>Time</span><span>Tries</span><span>Score</span><span></span></div>` +
      results.map((r) => `<div class="trow"><span>${r.level.index + 1}. ${r.level.name}</span><span>${formatTime(r.stats.seconds)}</span><span>${r.stats.attempts}</span><span>${r.breakdown.total}</span><span class="mini-stars">${'★'.repeat(r.breakdown.stars)}<i>${'★'.repeat(3 - r.breakdown.stars)}</i></span></div>`).join('');
    card.append(table);
    const rows = el('div', 'rows');
    rows.innerHTML = `
      <div class="row total"><span>Grand total</span><b class="total-val">0</b></div>
      <div class="row best"><span>Best</span><b>${Math.max(best, total)}</b></div>
    `;
    card.append(rows);
    const btns = el('div', 'btns');
    const replay = el('button', 'big-btn', 'Play again');
    replay.addEventListener('click', onReplay);
    btns.append(replay);
    card.append(btns);
    card.append(el('div', 'hint', 'Enter · play again'));
    this.overlay.append(card);
    this.countUp(rows.querySelector<HTMLElement>('.total-val')!, total, 700);
  }

  private pieceEl(p: PieceReward): HTMLElement {
    const box = el('div', 'piece');
    const pic = p.image ? `<img class="piece-monster" src="${p.image}" alt="Your monster so far" />` : `<div class="piece-emoji">${p.emoji}</div>`;
    const dots = Array.from({ length: p.total }, (_, i) => `<i class="${i < p.filled ? 'on' : ''}${i === p.filled - 1 ? ' new' : ''}"></i>`).join('');
    box.innerHTML = `${pic}<div class="piece-text"><div class="piece-kicker">New body piece!</div><div class="piece-label">${p.emoji} ${p.label}</div><div class="piece-dots">${dots}</div><div class="piece-count">${p.filled} / ${p.total} pieces</div></div>`;
    return box;
  }

  showMonsterFinal(
    results: { level: LevelDef; breakdown: ScoreBreakdown; stats: RunStats }[],
    total: number, stars: number, best: number, monster: MonsterFinal, onReplay: () => void, onStarSound: () => void,
  ): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const card = el('div', 'panel results final monster-final');
    card.innerHTML = `<div class="title">It's alive!</div><div class="subtitle">your Frankenstein is complete</div>`;
    const stage = el('div', 'monster-stage');
    stage.innerHTML = monster.image ? `<img src="${monster.image}" alt="Your monster" />` : '<div class="piece-emoji big">🧟</div>';
    card.append(stage);
    const nameRow = el('label', 'name-row');
    nameRow.innerHTML = '<span>Name</span>';
    const input = el('input', 'name-input');
    input.type = 'text';
    input.maxLength = 18;
    input.value = monster.defaultName;
    input.setAttribute('aria-label', 'Monster name');
    nameRow.append(input);
    card.append(nameRow);
    const name = () => input.value.trim() || monster.defaultName;
    const parts = el('div', 'parts');
    parts.innerHTML = monster.parts.map((p) => `<span>${p}</span>`).join('');
    card.append(parts);
    card.append(this.starsEl(stars, onStarSound));
    const rows = el('div', 'rows');
    rows.innerHTML = `
      <div class="row total"><span>Grand total</span><b class="total-val">0</b></div>
      <div class="row best"><span>Best</span><b>${Math.max(best, total)}</b></div>
    `;
    card.append(rows);
    const details = el('details', 'island-scores');
    details.innerHTML = '<summary>Island scores</summary>';
    const table = el('div', 'table');
    table.innerHTML = `<div class="trow head"><span>Island</span><span>Time</span><span>Tries</span><span>Score</span><span></span></div>` +
      results.map((r) => `<div class="trow"><span>${r.level.index + 1}. ${r.level.name}</span><span>${formatTime(r.stats.seconds)}</span><span>${r.stats.attempts}</span><span>${r.breakdown.total}</span><span class="mini-stars">${'★'.repeat(r.breakdown.stars)}<i>${'★'.repeat(3 - r.breakdown.stars)}</i></span></div>`).join('');
    details.append(table);
    card.append(details);
    const btns = el('div', 'btns');
    const share = el('button', 'big-btn share', 'Share 📤');
    share.addEventListener('click', async () => {
      share.disabled = true;
      try { this.toast(await monster.onShare(name()), 'good'); } finally { share.disabled = false; }
    });
    const save = el('button', 'big-btn alt', 'Save image');
    save.addEventListener('click', async () => {
      await monster.onDownload(name());
      this.toast('Picture saved! 🖼', 'good');
    });
    const replay = el('button', 'big-btn ghost', 'Play again');
    replay.addEventListener('click', onReplay);
    btns.append(share, save, replay);
    card.append(btns);
    this.overlay.append(card);
    this.countUp(rows.querySelector<HTMLElement>('.total-val')!, total, 700);
  }
}
