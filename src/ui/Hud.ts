import type { Input, TouchDir } from '../game/Input';
import type { RunStats, ScoreBreakdown } from '../game/Scoring';
import type { LevelDef } from '../game/Levels';
import { PERFECT_ATTEMPTS } from '../game/Scoring';
import { formatTime } from '../util/math';
import type { Campaign, CampaignId } from '../game/Campaign';
import { CAMPAIGNS } from '../game/Campaign';
import { ICONS, withIcon, type IconName } from './Icons';
import { facebookShareUrl, openExternal, xShareUrl, type PartChip, type PreparedCard, type ShareOutcome } from './Share';

/** Colour dot + label chips for monster pieces. */
const chips = (parts: PartChip[]): string =>
  parts.map((p) => `<span><i class="dot" style="background:${p.color}"></i>${p.label}</span>`).join('');

/** A body piece just won (results screen). */
export interface PieceReward {
  label: string;
  /** The piece's monster colour. */
  color: string;
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
  parts: PartChip[];
}

export interface PauseMenu {
  current: number;
  levels: { index: number; name: string; unlocked: boolean }[];
  monster?: PauseMonster;
  onResume: () => void;
  onRestart: () => void;
  onJump: (index: number) => void;
  /** Music toggle (Spooky Night only). */
  music?: { on: boolean; toggle: () => boolean };
  /** Debug shortcuts (shown only while debug tools are on). */
  debug?: { onOpenGate?: () => void; onComplete?: () => void; boosters?: { icon: string; name: string; onUse: () => void }[] };
  /** Ten quick music toggles: the secret switch for the debug tools. */
  onSecret?: () => void;
}

/** The finished monster (final screen). */
export interface MonsterFinal {
  image: string | null;
  defaultName: string;
  parts: PartChip[];
  /** Compose the share card for a name (renders the figure with the name on its base). */
  prepare: (name: string) => Promise<PreparedCard>;
  onShare: (card: PreparedCard) => Promise<ShareOutcome>;
  onSave: (card: PreparedCard) => Promise<ShareOutcome>;
  /** Facebook/X post text for a name, and the link the posts carry. */
  social?: { text: (name: string) => string; url: string };
}

/** A Facebook/X post: its text and the link to the game. */
export interface SocialPost { text: string; url: string }

export interface TargetCard { kind: string; name: string; icon: string; isImage: boolean }

/** A hint line that reads right for both keyboards and touch screens. */
const hint = (kbd: string, touch: string): HTMLElement => {
  const h = document.createElement('div');
  h.className = 'hint';
  h.innerHTML = `<span class="kbd-only">${kbd}</span>${touch ? `<span class="touch-only">${touch}</span>` : ''}`;
  return h;
};

/** A power-up from a booster pack. */
export interface BoosterCard { id: string; name: string; desc: string; icon: string }

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
  private goalsEl: HTMLElement;
  private boosterEl: HTMLElement;
  private boosterAdvance: (() => void) | null = null;
  private toastHost: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private lastTimer = '';
  private pauseBtn: HTMLButtonElement;
  /** Set by the game: the player tapped a monster picture (opens the 3D viewer). */
  onViewMonster: ((title?: string) => void) | null = null;
  /** Set by the game: the pause button was pressed. */
  onPause: (() => void) | null = null;

  constructor(input: Input) {
    const top = el('div', 'hud-top');
    const stats = el('div', 'hud-stats');
    this.timerEl = el('div', 'pill', `<span class="ico">${ICONS.timer}</span><span class="val">0:00</span>`);
    this.attemptsEl = el('div', 'pill', `<span class="ico">${ICONS.claw}</span><span class="val">0</span>`);
    this.levelEl = el('div', 'pill level', '<span class="val">Lv 1 · Meadow</span>');
    this.pauseBtn = el('button', 'pill pause-btn hidden', ICONS.pause);
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); this.onPause?.(); });
    this.boosterEl = el('div', 'pill booster-pill hidden');
    stats.append(this.levelEl, this.timerEl, this.attemptsEl, this.boosterEl);
    // Pause lives on its own in the top-right corner.
    this.pauseBtn.classList.add('pause-corner');
    const banner = el('div', 'banner');
    this.bannerEl = el('div', 'banner-title');
    this.bannerSub = el('div', 'banner-sub');
    banner.append(this.bannerEl, this.bannerSub);
    this.targetsEl = el('div', 'targets drawer hidden');
    this.goalsEl = el('div', 'targets goals drawer hidden');
    top.append(stats, banner);
    // Treasure and hatch lists: a pull-out tab on the right edge (icons only until opened).
    let collapsed = window.matchMedia('(max-width: 720px)').matches;
    try {
      const saved = localStorage.getItem('clawisland.drawer');
      if (saved) collapsed = saved === 'closed';
    } catch { /* ignore */ }
    const applyDrawer = () => {
      for (const d of [this.targetsEl, this.goalsEl]) d.classList.toggle('collapsed', collapsed);
    };
    applyDrawer();
    this.openDrawer = () => { collapsed = false; applyDrawer(); };
    for (const d of [this.targetsEl, this.goalsEl]) {
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        collapsed = !collapsed;
        applyDrawer();
        try { localStorage.setItem('clawisland.drawer', collapsed ? 'closed' : 'open'); } catch { /* ignore */ }
      });
    }
    this.toastHost = el('div', 'toasts');
    this.hud.append(top, this.targetsEl, this.goalsEl, this.pauseBtn, this.toastHost);

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
    this.targetsEl.innerHTML = '<div class="targets-title"><span class="drawer-arrow">◀</span><span class="drawer-label">Treasures</span></div>';
    this.cards.clear();
    for (const c of cards) {
      const card = el('div', 'card');
      const icon = c.isImage ? `<img src="${c.icon}" alt="${c.name}" />` : `<span class="card-fallback">${ICONS.token}</span>`;
      card.innerHTML = `<div class="card-icon">${icon}<div class="check">✓</div></div><div class="card-name">${c.name}</div>`;
      this.targetsEl.append(card);
      this.cards.set(c.kind, card);
    }
  }

  /** The "open the hatch" checklist shown while the hatch is shut. */
  /** The "open the hatch" list; `group` starts a new heading (one per station when there are several). */
  setGoals(cards: (TargetCard & { done: boolean; group?: string; svg?: string })[]): void {
    this.goalsEl.innerHTML = '<div class="targets-title"><span class="drawer-arrow">◀</span><span class="drawer-label">Open the hatch</span></div>';
    let group: string | undefined;
    for (const c of cards) {
      if (c.group && c.group !== group) {
        group = c.group;
        this.goalsEl.append(el('div', 'goal-group', `<span>${group}</span>`));
      }
      const card = el('div', `card${c.done ? ' done' : ''}`);
      const icon = c.isImage ? `<img src="${c.icon}" alt="${c.name}" />` : `<span class="card-fallback">${c.svg ?? ICONS.token}</span>`;
      card.innerHTML = `<div class="card-icon">${icon}<div class="check">✓</div></div><div class="card-name">${c.name}</div>`;
      this.goalsEl.append(card);
    }
  }

  /** Pull the side drawer out (without changing the player's saved preference). */
  openDrawer: () => void = () => {};

  showGoals(visible: boolean): void {
    this.goalsEl.classList.toggle('hidden', !visible);
  }

  /** The active booster, shown as a pill next to the timer. */
  setBooster(b: { icon: string; label: string } | null): void {
    this.boosterEl.classList.toggle('hidden', !b);
    if (b) this.boosterEl.innerHTML = `<span class="ico">${b.icon}</span><span class="val">${b.label}</span>`;
  }

  /** Enter / drop on the booster screen: open the pack, then continue. Returns false if no booster screen is up. */
  advanceBooster(): boolean {
    if (!this.boosterAdvance) return false;
    this.boosterAdvance();
    return true;
  }

  /** The booster pack after an island: tap to tear it open, then ride on. */
  showBooster(card: BoosterCard, onOpen: () => void, onDone: () => void): void {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    const panel = el('div', 'panel booster');
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.innerHTML = '<div class="title">Booster pack!</div><div class="subtitle">a power-up for the next island</div>';
    const stage = el('div', 'pack-stage');
    const pack = el('button', 'pack', `<span class="pack-top"></span><span class="pack-face">${ICONS.bat}<b>SPOOKY<br/>BOOST</b></span>`);
    pack.setAttribute('aria-label', 'Open the booster pack');
    const reveal = el('div', 'boost-card hidden', `<div class="boost-icon">${card.icon}</div><div class="boost-name">${card.name}</div><div class="boost-desc">${card.desc}</div>`);
    stage.append(pack, reveal);
    panel.append(stage);
    const btns = el('div', 'btns');
    const go = el('button', 'big-btn hidden', withIcon('play', 'Ride on'));
    btns.append(go);
    panel.append(btns);
    const h = hint('Enter · open the pack', 'tap the pack to open it');
    panel.append(h);
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      pack.classList.add('torn');
      onOpen();
      setTimeout(() => {
        pack.classList.add('hidden');
        reveal.classList.remove('hidden');
        go.classList.remove('hidden');
        h.innerHTML = '<span class="kbd-only">Enter · ride to the next island</span>';
      }, 450);
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.boosterAdvance = null;
      onDone();
    };
    pack.addEventListener('click', open);
    go.addEventListener('click', finish);
    this.boosterAdvance = () => { if (!opened) open(); else if (!go.classList.contains('hidden')) finish(); };
    this.overlay.append(panel);
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
        const t = el('button', `campaign-tab ${c.id === campaign.id ? 'on' : ''}`, withIcon(c.tabIcon as IconName, c.tab));
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
    ? '<li><b>3.</b> Clear an island to win a <b>body piece</b> from a random monster. Ten pieces make your own <b>Frankenstein</b>.</li>'
    : '<li><b>3.</b> Grab things dead centre. A sloppy grip wobbles, then slips.</li>'}
      </ol>
      <div class="keys kbd-only">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>←</kbd><kbd>→</kbd> rotate</span>
        <span><kbd>Space</kbd> drop · drop again to release</span>
      </div>
      <div class="keys touch-only">
        <span><b>Pad</b> moves the crane &nbsp; <b>↺ ↻</b> turn the claw</span>
        <span><b>DROP</b> grabs · tap DROP again to let go</span>
      </div>
    `;
    card.append(body);
    const btns = el('div', 'btns');
    const btn = el('button', 'big-btn', resume ? 'New game' : 'Start');
    btn.addEventListener('click', onStart);
    btns.append(btn);
    if (resume) {
      const pieces = spooky && resume.pieces ? ` · ${resume.pieces} ${ICONS.bone}` : '';
      const r = el('button', 'big-btn alt', `Continue · Lv ${resume.level.index + 1}${pieces}`);
      r.addEventListener('click', resume.onResume);
      btns.append(r);
    }
    card.append(btns);
    card.append(hint(resume ? 'press any key for a new game' : 'press any key or tap to start', resume ? 'tap a button to play' : 'tap Start to play'));
    this.overlay.append(card);
  }

  /** Turn monster pictures inside `root` into buttons that open the 3D viewer. */
  private viewable(root: HTMLElement, title?: () => string): void {
    root.querySelectorAll<HTMLElement>('.piece-monster, .monster-stage img').forEach((img) => {
      img.classList.add('viewable');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Look at your monster in 3D');
      img.title = 'Tap to look around';
      const badge = document.createElement('span');
      badge.className = 'view-badge';
      badge.innerHTML = ICONS.rotate;
      img.insertAdjacentElement('afterend', badge);
      const open = (e: Event) => { e.stopPropagation(); this.onViewMonster?.(title?.()); };
      img.addEventListener('click', open);
      badge.addEventListener('click', open);
    });
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
    card.innerHTML = `<div class="title">${m.monster ? `<span class="title-icon">${ICONS.bat}</span>` : ''}Paused</div>`;
    const resume = el('button', 'big-btn', withIcon('play', 'Resume'));
    resume.addEventListener('click', m.onResume);
    const top = el('div', 'btns');
    top.append(resume);
    card.append(top);
    if (m.monster) {
      const box = el('div', 'piece pause-monster');
      const pic = m.monster.image ? `<img class="piece-monster" src="${m.monster.image}" alt="Your monster so far" />` : `<div class="piece-fallback">${ICONS.monster}</div>`;
      const dots = Array.from({ length: m.monster.total }, (_, i) => `<i class="${i < m.monster!.filled ? 'on' : ''}"></i>`).join('');
      const parts = m.monster.parts.length ? chips(m.monster.parts) : '<span>No pieces yet: clear an island!</span>';
      box.innerHTML = `<div class="pic-wrap">${pic}</div><div class="piece-text"><div class="piece-kicker">Your monster</div><div class="piece-dots">${dots}</div><div class="piece-count">${m.monster.filled} / ${m.monster.total} pieces</div><div class="parts">${parts}</div></div>`;
      card.append(box);
      this.viewable(box);
    }
    const restart = el('button', 'big-btn alt small', withIcon('restart', 'Restart island'));
    restart.addEventListener('click', m.onRestart);
    const mid = el('div', 'btns');
    mid.append(restart);
    if (m.music) {
      const music = m.music;
      const label = (on: boolean) => withIcon(on ? 'music' : 'musicOff', on ? 'Music on' : 'Music off');
      const mb = el('button', 'big-btn ghost small', label(music.on));
      let taps = 0;
      let lastTap = 0;
      mb.addEventListener('click', () => {
        mb.innerHTML = label(music.toggle());
        const now = performance.now();
        taps = now - lastTap < 2500 ? taps + 1 : 1;
        lastTap = now;
        if (taps >= 10) { taps = 0; m.onSecret?.(); }
      });
      mid.append(mb);
    }
    card.append(mid);
    card.append(el('div', 'grid-title', 'Islands'));
    const grid = el('div', 'level-grid');
    for (const lv of m.levels) {
      const b = el('button', `level-btn${lv.index === m.current ? ' current' : ''}${lv.unlocked ? '' : ' locked'}`,
        lv.unlocked ? `<b>${lv.index + 1}</b> ${lv.name}` : `<b>${lv.index + 1}</b> ${ICONS.lock}`);
      b.disabled = !lv.unlocked;
      if (lv.unlocked) b.addEventListener('click', () => m.onJump(lv.index));
      grid.append(b);
    }
    card.append(grid);
    if (m.debug) {
      card.append(el('div', 'grid-title', 'Debug'));
      const dbg = el('div', 'btns debug-btns');
      const open = el('button', 'big-btn ghost small', withIcon('lock', 'Open gate'));
      if (m.debug.onOpenGate) open.addEventListener('click', m.debug.onOpenGate);
      else open.disabled = true;
      const done = el('button', 'big-btn ghost small', withIcon('bolt', 'Complete island'));
      if (m.debug.onComplete) done.addEventListener('click', m.debug.onComplete);
      else done.disabled = true;
      dbg.append(open, done);
      card.append(dbg);
      if (m.debug.boosters?.length) {
        const row = el('div', 'btns debug-btns');
        for (const b of m.debug.boosters) {
          const bb = el('button', 'big-btn ghost small', `${b.icon}<span>${b.name}</span>`);
          bb.addEventListener('click', b.onUse);
          row.append(bb);
        }
        card.append(row);
      }
    }
    card.append(hint('Esc · resume', ''));
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
    level: LevelDef, b: ScoreBreakdown, stats: RunStats, isLast: boolean, onContinue: () => void, onStarSound: () => void, piece?: PieceReward, social?: SocialPost,
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
      ${b.multiplier > 1 ? `<div class="row boost-row"><span>${ICONS.x2} Double points</span><b>×${b.multiplier}</b></div>` : ''}
      <div class="row total"><span>Score</span><b class="total-val">0</b></div>
    `;
    card.append(rows);
    if (social) card.append(this.socialRow(() => social));
    const btns = el('div', 'btns');
    const cont = el('button', 'big-btn', isLast ? (piece ? withIcon('bolt', 'It\'s alive!') : 'See final score') : withIcon('play', 'Continue'));
    cont.addEventListener('click', onContinue);
    btns.append(cont);
    card.append(btns);
    card.append(hint(isLast ? (piece ? 'Enter · bring your monster to life' : 'Enter · final score') : 'Enter · continue', ''));
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
    card.append(hint('Enter · play again', ''));
    this.overlay.append(card);
    this.countUp(rows.querySelector<HTMLElement>('.total-val')!, total, 700);
  }

  /** "Post on Facebook / X" buttons; the post is built at tap time (the name may have changed). */
  private socialRow(post: () => SocialPost): HTMLElement {
    const row = el('div', 'social-btns');
    const fb = el('button', 'social-btn fb', withIcon('facebook', 'Facebook'));
    fb.addEventListener('click', (e) => { e.stopPropagation(); openExternal(facebookShareUrl(post().url)); });
    const x = el('button', 'social-btn x', withIcon('x', 'Post'));
    x.addEventListener('click', (e) => { e.stopPropagation(); const p = post(); openExternal(xShareUrl(p.text, p.url)); });
    row.append(el('span', 'social-label', 'Share on'), fb, x);
    return row;
  }

  private pieceEl(p: PieceReward): HTMLElement {
    const box = el('div', 'piece');
    const pic = p.image ? `<img class="piece-monster" src="${p.image}" alt="Your monster so far" />` : `<div class="piece-fallback">${ICONS.monster}</div>`;
    const dots = Array.from({ length: p.total }, (_, i) => `<i class="${i < p.filled ? 'on' : ''}${i === p.filled - 1 ? ' new' : ''}"></i>`).join('');
    box.innerHTML = `<div class="pic-wrap">${pic}</div><div class="piece-text"><div class="piece-kicker">New body piece!</div><div class="piece-label"><i class="dot" style="background:${p.color}"></i>${p.label}</div><div class="piece-dots">${dots}</div><div class="piece-count">${p.filled} / ${p.total} pieces</div></div>`;
    this.viewable(box);
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
    stage.innerHTML = monster.image ? `<img src="${monster.image}" alt="Your monster" />` : `<div class="piece-fallback big">${ICONS.monster}</div>`;
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
    this.viewable(stage, name);
    const parts = el('div', 'parts');
    parts.innerHTML = chips(monster.parts);
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
    // Keep a composed card ready for the current name, so a tap can share or
    // save immediately (browsers and share sheets need the tap's user gesture).
    let ready: PreparedCard | null = null;
    let pending: Promise<PreparedCard> | null = null;
    const prepare = () => {
      const n = name();
      const p = monster.prepare(n);
      pending = p;
      p.then((c) => { if (pending === p) ready = c; }).catch(() => { /* retried on tap */ });
      return p;
    };
    const current = async () => (ready && ready.name === name() ? ready : prepare());
    prepare();
    let typing = 0;
    input.addEventListener('input', () => {
      ready = null;
      clearTimeout(typing);
      typing = window.setTimeout(prepare, 450);
    });
    const busy = (b: HTMLButtonElement, fn: () => Promise<void>) => async () => {
      b.disabled = true;
      try { await fn(); } finally { b.disabled = false; }
    };
    const share = el('button', 'big-btn share', withIcon('share', 'Share'));
    share.addEventListener('click', busy(share, async () => {
      const out = await monster.onShare(await current());
      this.toast(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Picture saved, link copied!' : 'Maybe later', out === 'cancelled' ? '' : 'good');
    }));
    const save = el('button', 'big-btn alt', withIcon('save', 'Save image'));
    save.addEventListener('click', busy(save, async () => {
      const out = await monster.onSave(await current());
      if (out === 'downloaded') this.toast('Picture saved!', 'good');
      else if (out === 'saved-sheet') this.toast('Pick "Save Image" to keep it', 'good');
    }));
    const replay = el('button', 'big-btn ghost', 'Play again');
    replay.addEventListener('click', onReplay);
    btns.append(share, save, replay);
    card.append(btns);
    const social = monster.social;
    if (social) card.append(this.socialRow(() => ({ text: social.text(name()), url: social.url })));
    this.overlay.append(card);
    this.countUp(rows.querySelector<HTMLElement>('.total-val')!, total, 700);
  }
}
