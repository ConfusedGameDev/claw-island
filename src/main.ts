import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';
import { Game } from './game/Game';
import { resolveCampaign } from './game/Campaign';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

async function boot(): Promise<void> {
  await RAPIER.init();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const campaign = resolveCampaign();
  document.body.classList.add(campaign.bodyClass);
  if (campaign.rewardsPieces) document.title = 'Claw Island: Spooky Night';
  const game = new Game(canvas, campaign);
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  // Leaving the app (or tab) pauses the game and silences all sound.
  let away = false;
  const setAway = (hidden: boolean) => {
    if (hidden === away) return;
    away = hidden;
    if (hidden) game.onAppHidden();
    else game.onAppVisible();
  };
  document.addEventListener('visibilitychange', () => setAway(document.hidden));
  window.addEventListener('pagehide', () => setAway(true));
  window.addEventListener('pageshow', () => setAway(document.hidden));
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => setAway(!isActive));
    void App.addListener('pause', () => setAway(true));
    void App.addListener('resume', () => setAway(false));
  }
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
