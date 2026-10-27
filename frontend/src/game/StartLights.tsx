import { useEffect, useRef, useState } from 'react';
import type { RaceController } from '../race/controller';
import { sound } from '../services/sound';

type Phase = { lit: number; out: boolean; hidden: boolean };

/**
 * Five-light start gantry. Light timings come from the authoritative schedule
 * (server timestamps in multiplayer, converted with the estimated clock offset),
 * so every participant sees the same sequence.
 */
export function StartLights({ race, compact }: { race: RaceController; compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>({ lit: 0, out: false, hidden: false });
  const last = useRef<Phase>(phase);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = race.now();
      const lit = race.lightsAt.filter((t) => now >= t).length;
      const out = now >= race.startAt;
      const hidden = now >= race.startAt + 1800;
      const prev = last.current;
      if (lit !== prev.lit || out !== prev.out || hidden !== prev.hidden) {
        if (lit > prev.lit && !out) sound.light();
        if (out && !prev.out && now - race.startAt < 1000) sound.lightsOut();
        last.current = { lit, out, hidden };
        setPhase(last.current);
      }
      if (!hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [race]);

  if (phase.hidden) return null;
  const lightsOn = phase.out ? 0 : phase.lit;
  return (
    <div className={`start-lights ${compact ? 'compact' : ''} ${phase.out ? 'is-out' : ''}`} role="status" aria-live="assertive">
      <div className="gantry">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="light-pod" key={i}>
            <span className={`bulb ${i < lightsOn ? 'on' : ''}`} />
            <span className={`bulb ${i < lightsOn ? 'on' : ''}`} />
          </div>
        ))}
      </div>
      <div className="lights-caption">
        {phase.out ? (
          <span className="go">LIGHTS OUT — GO!</span>
        ) : phase.lit === 0 ? (
          <span>Get ready… type when the lights go out</span>
        ) : phase.lit < 5 ? (
          <span>{phase.lit} / 5</span>
        ) : (
          <span>Hold…</span>
        )}
      </div>
    </div>
  );
}
