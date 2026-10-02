import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface CardInfo {
  name: string;
  /** One line per body piece, e.g. "🧛 Vampire's head". */
  parts: string[];
  total: number;
  stars: number;
  url: string;
}

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = '#2a2230', width = 10): void {
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

/** The shareable 1080x1350 card: title, the monster, its parts, score and the game link. */
export async function composeCard(monster: HTMLCanvasElement | null, info: CardInfo): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 32px Fredoka')]); } catch { /* ignore */ }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // Night sky with a big friendly moon.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a1840');
  sky.addColorStop(0.6, '#4a2a6e');
  sky.addColorStop(1, '#ff9a3c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 70; i++) {
    const x = (i * 397) % W;
    const y = (i * 211) % (H * 0.55);
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff1c9';
  ctx.shadowColor = '#fff1c9';
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.arc(W - 170, 200, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = '64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦇', 150, 170);
  ctx.fillText('🦇', 860, 360);
  ctx.font = '44px system-ui, sans-serif';
  ctx.fillText('🦇', 260, 300);

  // Ground hill.
  ctx.fillStyle = '#2a2230';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 210, W * 0.75, 170, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(0, H - 210, W, 210);

  // Title.
  fitFont(ctx, `Meet ${info.name}!`, 700, 96, W - 120);
  outlined(ctx, `Meet ${info.name}!`, W / 2, 110, '#ff9a3c', '#2a2230', 14);
  ctx.font = '600 36px Fredoka, system-ui, sans-serif';
  outlined(ctx, 'the Frankenstein I built in Claw Island', W / 2, 190, '#fff7e6', '#2a2230', 8);

  // The monster.
  if (monster) ctx.drawImage(monster, W / 2 - 430, 200, 860, 860);
  else {
    ctx.font = '400px system-ui, sans-serif';
    ctx.fillText('🧟', W / 2, 640);
  }

  // Parts list on a card.
  const listY = H - 330;
  ctx.fillStyle = 'rgba(255, 247, 230, 0.94)';
  roundRect(ctx, 50, listY, W - 100, 210, 28);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2a2230';
  ctx.stroke();
  ctx.fillStyle = '#2a2230';
  ctx.textAlign = 'left';
  ctx.font = '600 25px Fredoka, system-ui, sans-serif';
  info.parts.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.fillText(p, 80 + col * ((W - 160) / 2), listY + 30 + row * 37, (W - 200) / 2);
  });

  // Footer: stars, score, link.
  ctx.textAlign = 'center';
  ctx.font = '700 44px Fredoka, system-ui, sans-serif';
  const stars = '★'.repeat(info.stars) + '☆'.repeat(Math.max(0, 3 - info.stars));
  outlined(ctx, `${stars}  ${info.total.toLocaleString()} pts`, W / 2, H - 85, '#ffd23f', '#2a2230', 8);
  ctx.font = '600 30px Fredoka, system-ui, sans-serif';
  const link = info.url ? `Build yours: ${info.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : 'Claw Island: Spooky Night';
  fitFont(ctx, link, 600, 30, W - 100);
  ctx.fillStyle = '#fff7e6';
  ctx.fillText(link, W / 2, H - 35);
  return c;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

const fileName = (name: string) => `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'monster'}-claw-island.png`;

/**
 * Share the card with the game link: the native share sheet in the apps, the
 * Web Share API with the image where supported, else a PNG download plus the
 * text copied to the clipboard.
 */
export async function shareCard(card: HTMLCanvasElement, name: string, url: string): Promise<ShareOutcome> {
  const text = `Meet ${name}, the Frankenstein I built in Claw Island: Spooky Night! 🎃${url ? ` Build yours: ${url}` : ''}`;
  const title = `${name} · Claw Island`;
  if (Capacitor.isNativePlatform()) {
    try {
      const data = card.toDataURL('image/png').split(',')[1];
      const file = await Filesystem.writeFile({ path: fileName(name), data, directory: Directory.Cache });
      await Share.share({ title, text, url: url || undefined, files: [file.uri], dialogTitle: 'Share your monster' });
      return 'shared';
    } catch (err) {
      if (String(err).toLowerCase().includes('cancel')) return 'cancelled';
      console.warn('Native share failed', err);
      return 'cancelled';
    }
  }
  const blob = await toBlob(card);
  const file = new File([blob], fileName(name), { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
  }
  // No file sharing: save the picture, and share or copy the text with the link.
  download(blob, file.name);
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url: url || undefined });
      return 'shared';
    }
  } catch { /* fall through to the clipboard */ }
  try { await navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  return 'downloaded';
}

export async function downloadCard(card: HTMLCanvasElement, name: string): Promise<void> {
  download(await toBlob(card), fileName(name));
}
