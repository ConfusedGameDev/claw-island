import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';
import { Game } from './game/Game';
import { resolveCampaign } from './game/Campaign';

async function boot(): Promise<void> {
  await RAPIER.init();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const campaign = resolveCampaign();
  document.body.classList.add(campaign.bodyClass);
  if (campaign.rewardsPieces) document.title = 'Claw Island: Spooky Night';
  const game = new Game(canvas, campaign);
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  const loop = (now: number) => {
    game.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.innerHTML = `<div class="panel"><div class="title">Oops</div><p>${String(err)}</p></div>`;
});
