import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** One body piece on the card: its label and the monster's colour. */
export interface PartChip { label: string; color: string }

export interface CardInfo {
  name: string;
  parts: PartChip[];
  total: number;
  stars: number;
  url: string;
}

const W = 1080;
const H = 1350;
const INK = '#2a2230';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = INK, width = 10): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Shrink the font until `text` fits in `maxWidth`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number): void {
  let s = size;
  ctx.font = `${weight} ${s}px Fredoka, system-ui, sans-serif`;
  while (s > 20 && ctx.measureText(text).width > maxWidth) {
    s -= 4;
    ctx.font = `${weight} ${s}px Fredoka, system-ui, sans-serif`;
  }
}

/** A bat silhouette with scalloped wings, centred on (x, y). */
function bat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#1c1228';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.quadraticCurveTo(22, -24 - flap, 46, -14 - flap);
    ctx.quadraticCurveTo(40, -4, 44, 6);
    ctx.quadraticCurveTo(34, 0, 28, 8);
    ctx.quadraticCurveTo(20, 2, 14, 10);
    ctx.quadraticCurveTo(10, 4, 4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 3, -10);
    ctx.lineTo(side * 8, -20);
    ctx.lineTo(side * 8, -8);
    ctx.fill();
  }
  ctx.fillStyle = '#ffcf4a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 3.5, -3, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Without WebGL: a stitched figure silhouette instead of the 3D monster. */
function silhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.fillStyle = '#6a5a8f';
  ctx.beginPath();
  ctx.arc(cx, cy - 170, 150, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, cx - 110, cy - 40, 220, 230, 90);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 60, cy - 250);
  ctx.lineTo(cx + 60, cy - 240);
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 24, cy - 260);
    ctx.lineTo(cx + i * 24 + 2, cy - 230);
    ctx.stroke();
  }
  ctx.restore();
}

/** The shareable 1080x1350 card: title, the monster figure, its parts, score and the game link. */
export async function composeCard(monster: HTMLCanvasElement | null, info: CardInfo): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 32px Fredoka')]); } catch { /* ignore */ }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // Night sky fading to a pumpkin-orange horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#24163a');
  sky.addColorStop(0.55, '#4a2a6e');
  sky.addColorStop(1, '#f28a35');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 246, 234, 0.7)';
  for (let i = 0; i < 70; i++) {
    ctx.beginPath();
    ctx.arc((i * 397) % W, (i * 211) % (H * 0.55), 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Moon with soft craters.
  ctx.fillStyle = '#fff1c9';
  ctx.shadowColor = '#fff1c9';
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.arc(W - 170, 200, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(217, 196, 163, 0.55)';
  for (const [dx, dy, r] of [[-35, -20, 22], [30, 25, 16], [10, -50, 10], [-20, 45, 12]]) {
    ctx.beginPath();
    ctx.arc(W - 170 + dx, 200 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  bat(ctx, 150, 170, 1.6, 4);
  bat(ctx, 860, 370, 1.2, -6);
  bat(ctx, 270, 300, 0.9, 8);

  // Rolling graveyard hill.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 210, W * 0.75, 170, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(0, H - 210, W, 210);

  // Title.
  fitFont(ctx, `Meet ${info.name}!`, 700, 96, W - 120);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlined(ctx, `Meet ${info.name}!`, W / 2, 110, '#f28a35', INK, 14);
  ctx.font = '600 36px Fredoka, system-ui, sans-serif';
  outlined(ctx, 'the Frankenstein I built in Claw Island', W / 2, 190, '#fff7e6', INK, 8);

  // The figure.
  if (monster) ctx.drawImage(monster, W / 2 - 430, 200, 860, 860);
  else silhouette(ctx, W / 2, 680);

  // Parts list on a card, each with its monster's colour dot.
  const listY = H - 330;
  ctx.fillStyle = 'rgba(255, 247, 230, 0.95)';
  roundRect(ctx, 50, listY, W - 100, 210, 28);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = '600 25px Fredoka, system-ui, sans-serif';
  info.parts.forEach((p, i) => {
    const x = 80 + (i % 2) * ((W - 160) / 2);
    const y = listY + 30 + Math.floor(i / 2) * 37;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + 9, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(p.label, x + 30, y + 1, (W - 240) / 2);
  });

  // Footer: stars, score, link.
  ctx.textAlign = 'center';
  ctx.font = '700 44px Fredoka, system-ui, sans-serif';
  const stars = '★'.repeat(info.stars) + '☆'.repeat(Math.max(0, 3 - info.stars));
  outlined(ctx, `${stars}  ${info.total.toLocaleString()} pts`, W / 2, H - 85, '#ffcf4a', INK, 8);
  const link = info.url ? `Build yours: ${info.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : 'Claw Island: Spooky Night';
  fitFont(ctx, link, 600, 30, W - 100);
  ctx.fillStyle = '#fff7e6';
  ctx.fillText(link, W / 2, H - 35);
  return c;
}

/** A composed card with its PNG ready, so share/save can run straight from a tap. */
export interface PreparedCard {
  name: string;
  canvas: HTMLCanvasElement;
  blob: Blob;
  file: File;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));

const fileName = (name: string) => `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'monster'}-claw-island.png`;

export async function prepareCard(canvas: HTMLCanvasElement, name: string): Promise<PreparedCard> {
  const blob = await toBlob(canvas);
  return { name, canvas, blob, file: new File([blob], fileName(name), { type: 'image/png' }) };
}

/** Write the PNG to the app cache (native only) and return its file URI. */
async function writeNative(card: PreparedCard): Promise<string> {
  const data = card.canvas.toDataURL('image/png').split(',')[1];
  const res = await Filesystem.writeFile({ path: card.file.name, data, directory: Directory.Cache });
  return res.uri;
}

function download(card: PreparedCard): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(card.blob);
  a.download = card.file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'saved-sheet';

const isCancel = (err: unknown) => /cancel|abort/i.test(String((err as Error)?.message ?? err)) || (err as DOMException)?.name === 'AbortError';

/**
 * Share the card with the game link: the native share sheet in the apps, the
 * Web Share API with the image where supported, else a PNG download plus the
 * text copied to the clipboard. Call straight from the tap: nothing is awaited
 * before the browser share/download starts.
 */
export async function shareCard(card: PreparedCard, url: string): Promise<ShareOutcome> {
  const text = `Meet ${card.name}, the Frankenstein I built in Claw Island: Spooky Night!${url ? ` Build yours: ${url}` : ''}`;
  const title = `${card.name} · Claw Island`;
  if (Capacitor.isNativePlatform()) {
    try {
      const uri = await writeNative(card);
      await Share.share({ title, text, url: url || undefined, files: [uri], dialogTitle: 'Share your monster' });
      return 'shared';
    } catch (err) {
      if (!isCancel(err)) console.warn('Native share failed', err);
      return 'cancelled';
    }
  }
  try {
    if (navigator.canShare?.({ files: [card.file] })) {
      await navigator.share({ files: [card.file], title, text });
      return 'shared';
    }
  } catch (err) {
    if (isCancel(err)) return 'cancelled';
  }
  download(card);
  try { await navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  return 'downloaded';
}

/**
 * Save the picture. In the apps (WKWebView ignores download links) this opens
 * the native sheet with only the image, where iOS offers "Save Image" and
 * Android offers Photos/Files. On the web it downloads the PNG.
 */
export async function saveCard(card: PreparedCard): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    try {
      const uri = await writeNative(card);
      await Share.share({ files: [uri], dialogTitle: 'Save your monster' });
      return 'saved-sheet';
    } catch (err) {
      if (!isCancel(err)) console.warn('Native save failed', err);
      return 'cancelled';
    }
  }
  download(card);
  return 'downloaded';
}
