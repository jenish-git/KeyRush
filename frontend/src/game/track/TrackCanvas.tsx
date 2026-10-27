import { useEffect, useRef } from 'react';
import { getCar, type RacerSnapshot } from '@shared/index';
import type { RaceController } from '../../race/controller';
import { drawCar } from '../cars/drawCar';

interface Particle {
  x: number; // world px
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

/**
 * Canvas race view. Pure presentation: it reads standings from the controller
 * every frame and smooths them with frame-time-based interpolation. It never
 * influences scoring; official positions come from the simulation/server.
 */
export function TrackCanvas({ race, reducedMotion }: { race: RaceController; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const order = new Map(race.racers.map((r, i) => [r.id, i]));
    const display = new Map<string, number>();
    const particles: Particle[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let camera = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const frame = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const now = race.now();
      const snap = race.snapshot();
      const live = now >= race.startAt && !race.finished && !race.paused;
      const ahead = live ? Math.min(0.25, Math.max(0, (now - snap.at) / 1000)) : 0;
      const byId = new Map<string, RacerSnapshot>(snap.racers.map((r) => [r.id, r]));

      // Smooth display distances (frame-rate independent exponential approach).
      const k = 1 - Math.exp(-dt / 0.12);
      for (const r of race.racers) {
        const s = byId.get(r.id);
        const target = s ? s.distance + (s.carStatus === 'crashed' ? 0 : s.speed * ahead) : 0;
        const cur = display.get(r.id) ?? target;
        display.set(r.id, reducedMotion ? target : cur + (target - cur) * k);
      }

      const self = byId.get(race.selfId);
      const pxPerChar = Math.max(7, Math.min(16, w / 70));
      const selfX = (display.get(race.selfId) ?? 0) * pxPerChar;
      const camTarget = selfX - w * 0.33;
      camera = reducedMotion ? camTarget : camera + (camTarget - camera) * (1 - Math.exp(-dt / 0.08));

      // Which cars get a lane: everyone on large views, nearest rivals on small ones.
      const kerb = Math.max(8, Math.min(14, h * 0.05));
      const stand = h > 240 ? Math.min(34, h * 0.1) : 0;
      const trackTop = stand + kerb;
      const trackH = h - trackTop - kerb;
      const maxLanes = Math.max(2, Math.floor(trackH / 22));
      let visible = race.racers.map((r) => r.id);
      if (visible.length > maxLanes) {
        const sd = display.get(race.selfId) ?? 0;
        visible = visible
          .filter((id) => id !== race.selfId)
          .sort((a, b) => Math.abs((display.get(a) ?? 0) - sd) - Math.abs((display.get(b) ?? 0) - sd))
          .slice(0, maxLanes - 1)
          .concat(race.selfId)
          .sort((a, b) => order.get(a)! - order.get(b)!);
      }
      const laneH = trackH / visible.length;
      const carLen = Math.max(26, Math.min(76, laneH * 2.1, w * 0.13));

      // Camera shake on crash.
      let shakeX = 0;
      let shakeY = 0;
      if (self?.carStatus === 'crashed' && !reducedMotion) {
        shakeX = (Math.random() - 0.5) * 6;
        shakeY = (Math.random() - 0.5) * 4;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(shakeX, shakeY);

      // Grandstand band with parallax.
      if (stand) {
        ctx.fillStyle = '#16181c';
        ctx.fillRect(-10, -10, w + 20, stand + 10);
        const off = -((camera * 0.35) % 24);
        for (let x = off - 24; x < w + 24; x += 24) {
          ctx.fillStyle = '#20242a';
          ctx.fillRect(x, 6, 18, stand - 10);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          for (let y = 9; y < stand - 6; y += 5) ctx.fillRect(x + 2, y, 14, 1);
        }
        const adOff = -((camera * 0.6) % 220);
        ctx.font = '700 11px "Barlow Condensed", sans-serif';
        for (let x = adOff - 220; x < w + 220; x += 220) {
          ctx.fillStyle = '#e10600';
          ctx.fillRect(x, stand - 8, 120, 6);
          ctx.fillStyle = '#c9ced6';
          ctx.fillRect(x + 130, stand - 8, 70, 6);
        }
      }

      // Kerbs (top and bottom), scrolling with the camera.
      const kerbW = 26;
      const kOff = -(((camera % (kerbW * 2)) + kerbW * 2) % (kerbW * 2));
      for (let x = kOff - kerbW * 2; x < w + kerbW * 2; x += kerbW) {
        const i = Math.round((x - kOff) / kerbW);
        ctx.fillStyle = i % 2 === 0 ? '#d90f1c' : '#eef0f2';
        ctx.fillRect(x, stand, kerbW, kerb);
        ctx.fillRect(x, h - kerb, kerbW, kerb);
      }

      // Asphalt
      const g = ctx.createLinearGradient(0, trackTop, 0, trackTop + trackH);
      g.addColorStop(0, '#2a2d32');
      g.addColorStop(0.5, '#25282c');
      g.addColorStop(1, '#2a2d32');
      ctx.fillStyle = g;
      ctx.fillRect(-10, trackTop, w + 20, trackH);

      // Lane separators (dashed)
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([22, 18]);
      ctx.lineDashOffset = camera;
      for (let i = 1; i < visible.length; i++) {
        const y = trackTop + i * laneH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Distance markers every 100 characters + start line at 0.
      const firstMark = Math.floor(camera / pxPerChar / 100) * 100;
      ctx.font = '600 10px "Barlow Condensed", sans-serif';
      for (let d = firstMark; d * pxPerChar - camera < w + 100; d += 100) {
        if (d < 0) continue;
        const x = d * pxPerChar - camera;
        if (d === 0) {
          const sq = Math.max(4, laneH / 6);
          for (let y = trackTop, row = 0; y < trackTop + trackH; y += sq, row++) {
            for (let c = 0; c < 2; c++) {
              ctx.fillStyle = (row + c) % 2 ? '#111' : '#f4f4f4';
              ctx.fillRect(x + c * sq, y, sq, Math.min(sq, trackTop + trackH - y));
            }
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x, trackTop, 2, trackH);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillText(String(d), x + 4, trackTop + 11);
        }
      }

      // Grid boxes behind the start line.
      visible.forEach((_, lane) => {
        const x = -carLen * 0.6 - camera;
        if (x > -carLen * 2 && x < w) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          const y = trackTop + lane * laneH + laneH * 0.15;
          ctx.beginPath();
          ctx.moveTo(x + carLen * 0.55, y);
          ctx.lineTo(x - carLen * 0.55, y);
          ctx.moveTo(x + carLen * 0.55, y + laneH * 0.7);
          ctx.lineTo(x - carLen * 0.55, y + laneH * 0.7);
          ctx.stroke();
        }
      });

      // Particles (smoke, tyre dust) in world space.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = 1 - p.life / p.max;
        ctx.fillStyle = p.color.replace('$a', (a * 0.6).toFixed(3));
        ctx.beginPath();
        ctx.arc(p.x - camera, p.y, p.size * (1 + p.life * 1.5), 0, Math.PI * 2);
        ctx.fill();
      }

      // Cars
      const offscreen: { id: string; side: -1 | 1; lane: number; gap: number }[] = [];
      visible.forEach((id, lane) => {
        const info = race.racers[order.get(id)!];
        const s = byId.get(id);
        const dist = display.get(id) ?? 0;
        const worldX = dist * pxPerChar;
        let x = worldX - camera;
        const y = trackTop + lane * laneH + laneH / 2;
        // Nose sits on the distance; keep cars on the grid visually behind the line.
        x -= carLen / 2;
        if (x < -carLen) return offscreen.push({ id, side: -1, lane, gap: dist - (display.get(race.selfId) ?? 0) });
        if (x > w + carLen) return offscreen.push({ id, side: 1, lane, gap: dist - (display.get(race.selfId) ?? 0) });

        const status = s?.carStatus ?? 'grid';
        const crashed = status === 'crashed';
        const speed = s?.speed ?? 0;
        let cx = x;
        let cy = y;
        if (crashed && !reducedMotion) {
          cx += (Math.random() - 0.5) * 3;
          cy += (Math.random() - 0.5) * 3;
        }

        // Speed streaks behind fast cars.
        if (speed > 2.5 && !reducedMotion && live) {
          ctx.strokeStyle = 'rgba(255,255,255,0.10)';
          ctx.lineWidth = 1;
          for (let j = 0; j < 3; j++) {
            const ly = cy + (j - 1) * carLen * 0.12;
            ctx.beginPath();
            ctx.moveTo(cx - carLen * 0.55, ly);
            ctx.lineTo(cx - carLen * 0.55 - speed * 6 - j * 6, ly);
            ctx.stroke();
          }
        }

        // Spawn smoke for crashes and tyre lock-ups.
        if (live && !reducedMotion && (crashed || status === 'critical') && particles.length < 160) {
          const n = crashed ? 3 : 1;
          for (let j = 0; j < n; j++) {
            particles.push({
              x: worldX - carLen * 0.9 + (Math.random() - 0.5) * 8,
              y: cy + (Math.random() - 0.5) * carLen * 0.25,
              vx: -10 - Math.random() * 20,
              vy: (Math.random() - 0.5) * 18,
              life: 0,
              max: crashed ? 1.1 : 0.6,
              size: carLen * (crashed ? 0.08 : 0.05),
              color: crashed ? 'rgba(190,190,195,$a)' : 'rgba(130,130,135,$a)'
            });
          }
        }

        const isSelf = id === race.selfId;
        if (isSelf) {
          ctx.fillStyle = 'rgba(225,6,0,0.16)';
          ctx.fillRect(0, trackTop + lane * laneH + 1, w, laneH - 2);
        }
        drawCar(ctx, getCar(info.carId), cx, cy, carLen, {
          braking: status === 'slowed' || status === 'critical' || crashed,
          ghost: s?.status === 'disconnected' || s?.status === 'abandoned'
        });

        if (laneH >= 18) {
          ctx.font = `600 ${Math.max(10, Math.min(13, laneH * 0.32))}px "Barlow Condensed", sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const label = isSelf ? 'YOU' : info.name.toUpperCase();
          const lx = cx + carLen * 0.6;
          ctx.fillStyle = isSelf ? '#ff3b30' : 'rgba(255,255,255,0.75)';
          ctx.fillText(label, lx, cy - laneH * 0.22);
          if (crashed) {
            ctx.fillStyle = '#ffb000';
            ctx.fillText('CRASH', lx, cy + laneH * 0.22);
          } else if (status === 'recovering') {
            ctx.fillStyle = '#39e1ff';
            ctx.fillText('RECOVERING', lx, cy + laneH * 0.22);
          }
        }
      });

      // Edge indicators for cars outside the view.
      ctx.font = '700 11px "Barlow Condensed", sans-serif';
      for (const o of offscreen) {
        const info = race.racers[order.get(o.id)!];
        const y = trackTop + o.lane * laneH + laneH / 2;
        const x = o.side === 1 ? w - 8 : 8;
        ctx.fillStyle = getCar(info.carId).body;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - o.side * 10, y - 7);
        ctx.lineTo(x - o.side * 10, y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textAlign = o.side === 1 ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        const gap = `${o.gap > 0 ? '+' : ''}${Math.round(o.gap)}`;
        ctx.fillText(laneH >= 18 ? `${info.name.split(' ').pop()} ${gap}` : gap, x - o.side * 14, y);
      }
      ctx.textAlign = 'left';

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [race, reducedMotion]);

  return <canvas ref={canvasRef} className="track-canvas" aria-label="Race track" role="img" />;
}
