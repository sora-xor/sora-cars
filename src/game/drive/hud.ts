import { DAMAGE_LIMIT } from './damage';

/** Body damage as the HUD shows it: front, rear, left and right zone points, and the total. */
export interface DamageReadout { readonly front: number; readonly rear: number; readonly left: number; readonly right: number; readonly total: number }

const ZONE_SCALE = 35;
function zoneColour(points: number): string {
  const share = points / ZONE_SCALE;
  return share < 0.15 ? '#e9e2d1' : share < 0.45 ? '#f2c45a' : share < 0.8 ? '#ef7a3c' : '#e0373c';
}

/** A top-down car whose panels redden where it has been hit, and a damage bar to the wreck limit.
 * (x, y) is the gauge's lower-left corner in HUD pixels. */
export function drawDamageGauge(ctx: CanvasRenderingContext2D, x: number, y: number, damage: DamageReadout, time: number, compact: boolean): void {
  const share = Math.min(1, damage.total / DAMAGE_LIMIT), critical = share >= 0.75;
  const width = compact ? 9 : 12, length = compact ? 17 : 23, top = y - length;
  ctx.save();
  ctx.shadowColor = 'rgba(12,16,28,.8)'; ctx.shadowBlur = 4;
  // Body shell, then the four panels over it.
  ctx.fillStyle = '#2a2236'; ctx.fillRect(x - 1, top - 1, width + 2, length + 2);
  ctx.shadowBlur = 0;
  const cap = Math.round(length * 0.24), side = Math.max(2, Math.round(width * 0.26));
  ctx.fillStyle = zoneColour(damage.front); ctx.fillRect(x, top, width, cap);
  ctx.fillStyle = zoneColour(damage.rear); ctx.fillRect(x, top + length - cap, width, cap);
  ctx.fillStyle = zoneColour(damage.left); ctx.fillRect(x, top + cap, side, length - cap * 2);
  ctx.fillStyle = zoneColour(damage.right); ctx.fillRect(x + width - side, top + cap, side, length - cap * 2);
  ctx.fillStyle = '#4b5469'; ctx.fillRect(x + side, top + cap + 1, width - side * 2, length - cap * 2 - 2);
  // Bar and reading.
  const barX = x + width + (compact ? 6 : 8), barWidth = compact ? 64 : 104, barY = y - 6;
  ctx.fillStyle = '#2b2136'; ctx.fillRect(barX, barY, barWidth, 6);
  const flash = critical && Math.floor(time * 4) % 2 === 0;
  ctx.fillStyle = share < 0.4 ? '#e9e2d1' : share < 0.75 ? '#f2c45a' : flash ? '#ffd0c0' : '#e0373c';
  ctx.fillRect(barX, barY, barWidth * share, 6);
  ctx.textAlign = 'left'; ctx.font = `${compact ? 7 : 10}px SoraJP, LabJP, monospace`; ctx.fillStyle = critical ? '#ffb4a4' : '#d9d1df';
  ctx.fillText(`車体 / DAMAGE  ${Math.round(share * 100)}%`, barX, barY - 5);
  ctx.restore();
}

/** Facing more than this far from the road's direction (rad) reads as the wrong way. */
export const WRONG_WAY = 1.75;
/** Ticks without gaining ground before the HUD counts down to the marshals' recovery. */
export const RECOVERY_NOTICE = 60;

/** Upper banner while the player's car points the wrong way or is about to be recovered. */
export function drawRecoveryBanner(ctx: CanvasRenderingContext2D, width: number, height: number, wrongWay: boolean, seconds: number | undefined, time: number): void {
  if (!wrongWay && seconds === undefined) return;
  const compact = width < 400, y = height * (compact ? 0.3 : 0.26), band = compact ? 44 : 54;
  ctx.save();
  ctx.fillStyle = '#211b30'; ctx.globalAlpha = 0.8; ctx.fillRect(0, y, width, band); ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = wrongWay && Math.floor(time * 3) % 2 === 0 ? '#fff0cb' : '#ff9c84';
  ctx.font = `bold ${compact ? 17 : 23}px SoraJP, LabJP, sans-serif`;
  ctx.fillText(wrongWay ? '逆走' : '立ち往生', width / 2, y + (compact ? 21 : 26));
  ctx.fillStyle = '#fff0cb'; ctx.font = `${compact ? 8 : 10}px Sora, LabSora, sans-serif`;
  const recovery = seconds === undefined ? '' : `マーシャル救済まで ${Math.ceil(seconds)} · MARSHALS IN ${Math.ceil(seconds)}`;
  ctx.fillText(wrongWay ? `WRONG WAY${recovery ? ` — ${recovery}` : ' — TURN AROUND'}` : `STUCK — ${recovery}`, width / 2, y + (compact ? 36 : 45));
  ctx.restore();
}

/** Centre banner for the player's wreck. */
export function drawWreckBanner(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = '#211b30'; ctx.globalAlpha = 0.86; ctx.fillRect(0, height * 0.39, width, 80); ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.fillStyle = '#ff9c84'; ctx.font = 'bold 31px SoraJP, LabJP, sans-serif';
  ctx.fillText('大破', width / 2, height * 0.39 + 36);
  ctx.fillStyle = '#fff0cb'; ctx.font = '11px Sora, LabSora, sans-serif';
  ctx.fillText('WRECKED · リタイア — THE FIELD RACES ON', width / 2, height * 0.39 + 60);
  ctx.restore();
}
