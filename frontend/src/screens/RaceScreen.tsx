import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCar, speedKmh, type RacerSnapshot } from '@shared/index';
import type { RaceController } from '../race/controller';
import { StartLights } from '../game/StartLights';
import { TrackCanvas } from '../game/track/TrackCanvas';
import { TypingPanel } from '../game/typing/TypingPanel';
import { sound } from '../services/sound';
import { useKeyboardInset } from '../hooks/useViewport';

interface Hud {
  now: number;
  standings: RacerSnapshot[];
  self?: RacerSnapshot;
  position: number;
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RaceScreen({
  race,
  title,
  connection,
  reducedMotion,
  soundOn,
  onToggleSound,
  onExit
}: {
  race: RaceController;
  title: string;
  connection?: 'online' | 'offline' | 'connecting' | 'idle';
  reducedMotion: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onExit: () => void;
}) {
  useSyncExternalStore(race.subscribe.bind(race), () => race.version);
  const keyboardOpen = useKeyboardInset();
  const [hud, setHud] = useState<Hud>({ now: race.now(), standings: [], position: 0 });
  const [banner, setBanner] = useState<{ text: string; kind: string; id: number } | null>(null);
  const lastPos = useRef(0);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) (window as any).__keyrush = race;
  }, [race]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = race.now();
      const { racers } = race.snapshot();
      const idx = racers.findIndex((r) => r.id === race.selfId);
      const self = racers[idx];
      const position = idx + 1;
      const live = now >= race.startAt && !race.finished && !race.paused;
      if (live && lastPos.current && position < lastPos.current) sound.overtake();
      lastPos.current = position;
      if (live && self) sound.setEngine(self.speed);
      else sound.stopEngine();
      setHud({ now, standings: racers, self, position });
    }, 100);
    return () => {
      clearInterval(t);
      sound.stopEngine();
    };
  }, [race]);

  useEffect(
    () =>
      race.onEvent((e) => {
        if (e.type === 'finished') {
          sound.stopEngine();
          sound.finish();
          return;
        }
        const name = race.racers.find((r) => r.id === e.playerId)?.name ?? 'A driver';
        const mine = e.playerId === race.selfId;
        if (e.type === 'crash') {
          if (mine) sound.crash();
          setBanner({ text: mine ? 'CRASH! Fix your errors to recover' : `${name} crashed`, kind: mine ? 'danger' : 'info', id: Date.now() });
        } else if (e.type === 'false-start') {
          if (mine) sound.falseStart();
          setBanner({ text: mine ? 'JUMP START — 2s penalty' : `${name} jumped the start`, kind: mine ? 'danger' : 'info', id: Date.now() });
        }
      }),
    [race]
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  const now = hud.now;
  const started = now >= race.startAt;
  const remaining = started ? race.endAt - now : race.durationMs;
  const status = race.finished ? 'FINISHED' : race.paused ? 'PAUSED' : started ? 'RACING' : 'GRID';
  const self = hud.self;
  const offline = connection === 'offline' || connection === 'connecting';
  const leaderDist = hud.standings[0]?.distance ?? 0;

  return (
    <div className={`race-layout ${keyboardOpen ? 'kb-open' : ''}`}>
      <section className="track-panel" aria-label="Race">
        <header className="race-topbar">
          <div className="race-title">
            <span className={`status-dot ${status.toLowerCase()}`} />
            <span className="race-name">{title}</span>
            <span className="race-status">{status}</span>
          </div>
          <div className="race-clock" aria-label="Time remaining">
            {fmtTime(remaining)}
          </div>
          <div className="race-actions">
            <button
              className="btn ghost sm"
              aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
              onClick={() => {
                sound.unlock();
                onToggleSound();
              }}
            >
              {soundOn ? '\u{1F50A}' : '\u{1F507}'}
            </button>
            {race.canPause && (
              <button className="btn ghost sm" onClick={() => (race.paused ? race.resume() : race.pause())}>
                {race.paused ? 'Resume' : 'Pause'}
              </button>
            )}
            <button className="btn ghost sm" onClick={() => (race.finished ? onExit() : setConfirmExit(true))}>
              Exit
            </button>
          </div>
        </header>

        <div className="track-stage">
          <TrackCanvas race={race} reducedMotion={reducedMotion} />
          {!race.paused && <StartLights race={race} compact={keyboardOpen} />}
          {banner && (
            <div key={banner.id} className={`race-banner ${banner.kind}`} role="alert">
              {banner.text}
            </div>
          )}
          <div className="hud-position" aria-label="Your position">
            <span className="p">P{hud.position || '-'}</span>
            <span className="of">/{race.racers.length}</span>
          </div>
          <ol className="mini-board" aria-label="Live standings" style={{ height: `${hud.standings.length * 24}px` }}>
            {hud.standings.map((r, i) => {
              const info = race.racers.find((x) => x.id === r.id);
              if (!info) return null;
              return (
                <li
                  key={r.id}
                  className={`${r.id === race.selfId ? 'me' : ''} ${r.status !== 'racing' ? 'dim' : ''}`}
                  style={{ transform: `translateY(${i * 24}px)` }}
                >
                  <span className="pos">{i + 1}</span>
                  <span className="bar" style={{ background: getCar(info.carId).body }} />
                  <span className="nm">{r.id === race.selfId ? 'YOU' : info.name}</span>
                  <span className="gap">{i === 0 ? `${Math.round(r.effectiveWpm)} wpm` : `-${Math.round(leaderDist - r.distance)}`}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="telemetry">
          <Metric label="WPM" value={self ? Math.round(self.effectiveWpm) : 0} />
          <Metric label="ACC" value={`${self ? Math.round(self.accuracy) : 100}%`} />
          <Metric label="KM/H" value={speedKmh(self?.speed ?? 0)} />
          <Metric label="DIST" value={Math.round(self?.distance ?? 0)} className="hide-xs" />
          <Metric label="STATE" value={(self?.carStatus ?? 'grid').toUpperCase()} className={`state-${self?.carStatus ?? 'grid'} hide-xs`} />
          <Metric label="REACT" value={race.reactionMs !== null ? `${(race.reactionMs / 1000).toFixed(3)}s` : '—'} className="hide-sm" />
        </div>
      </section>

      <section className="type-col" aria-label="Typing">
        <TypingPanel race={race} reducedMotion={reducedMotion} active={!race.paused && !race.finished} />
      </section>

      {race.paused && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Paused</h2>
            <p className="muted">The race clock is stopped.</p>
            <div className="row">
              <button className="btn primary" onClick={() => race.resume()}>
                Resume
              </button>
              <button className="btn ghost" onClick={onExit}>
                Quit race
              </button>
            </div>
          </div>
        </div>
      )}
      {offline && !race.finished && (
        <div className="overlay soft">
          <div className="overlay-card">
            <div className="spinner" />
            <h2>Connection lost</h2>
            <p className="muted">Reconnecting… your progress is kept by the server and the race continues for everyone else.</p>
          </div>
        </div>
      )}
      {confirmExit && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Leave the race?</h2>
            <p className="muted">
              {race.mode === 'multiplayer' ? 'You will be marked as retired. Others keep racing.' : 'This race will not be saved.'}
            </p>
            <div className="row">
              <button className="btn danger" onClick={onExit}>
                Leave
              </button>
              <button className="btn ghost" onClick={() => setConfirmExit(false)}>
                Keep racing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, className = '' }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={`metric ${className}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
