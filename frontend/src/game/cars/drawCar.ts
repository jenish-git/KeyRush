// Original top-down open-wheel car artwork, drawn in a 100 x 40 unit box
// facing right. Shared by the canvas renderer; CarSprite mirrors it in SVG.

import type { CarLivery } from '@shared/index';

export const CAR_W = 100;
export const CAR_H = 40;

export function drawCar(
  ctx: CanvasRenderingContext2D,
  car: CarLivery,
  x: number,
  y: number,
  length: number,
  opts: { braking?: boolean; ghost?: boolean } = {}
) {
  const s = length / CAR_W;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-CAR_W / 2, -CAR_H / 2);
  if (opts.ghost) ctx.globalAlpha = 0.55;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 6, 6, 92, 32, 8);
  ctx.fill();

  // Tires
  ctx.fillStyle = '#121212';
  roundRect(ctx, 14, 0, 15, 9, 2.5); ctx.fill();
  roundRect(ctx, 14, 31, 15, 9, 2.5); ctx.fill();
  roundRect(ctx, 64, 1, 12, 8, 2.5); ctx.fill();
  roundRect(ctx, 64, 31, 12, 8, 2.5); ctx.fill();

  // Rear wing
  ctx.fillStyle = car.accent;
  roundRect(ctx, 2, 5, 9, 30, 2); ctx.fill();

  // Body + sidepods
  ctx.fillStyle = car.body;
  ctx.beginPath();
  ctx.moveTo(11, 13);
  ctx.lineTo(30, 10);
  ctx.lineTo(56, 11);
  ctx.lineTo(72, 15);
  ctx.lineTo(96, 18);
  ctx.lineTo(96, 22);
  ctx.lineTo(72, 25);
  ctx.lineTo(56, 29);
  ctx.lineTo(30, 30);
  ctx.lineTo(11, 27);
  ctx.closePath();
  ctx.fill();

  // Stripe
  ctx.fillStyle = car.stripe;
  ctx.fillRect(14, 18.6, 80, 2.8);

  // Front wing
  ctx.fillStyle = car.accent;
  roundRect(ctx, 89, 3, 8, 34, 2); ctx.fill();

  // Cockpit + halo
  ctx.fillStyle = '#0d0d0f';
  ctx.beginPath();
  ctx.ellipse(50, 20, 8, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3d42';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(51, 20, 9.5, 5.6, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Number
  ctx.fillStyle = car.accent;
  ctx.font = 'bold 9px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(car.number), 30, 20.5);

  // Brake / rain light
  ctx.fillStyle = opts.braking ? '#ff2a2a' : '#5a0d0d';
  if (opts.braking) {
    ctx.shadowColor = '#ff2a2a';
    ctx.shadowBlur = 10;
  }
  ctx.fillRect(0, 17.5, 3, 5);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
