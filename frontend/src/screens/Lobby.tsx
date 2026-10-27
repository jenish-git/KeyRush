import { useState } from 'react';
import { getCar, ROOM, type RoomView, type SessionInfo } from '@shared/index';
import { CarPicker } from '../components/CarPicker';
import { CarSprite } from '../components/CarSprite';
import { DurationPicker, ErrorNote, Field, ScreenShell, Segmented } from '../components/ui';

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for insecure contexts (e.g. LAN IP over http).
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="room-code">
      <span className="eyebrow">Room code</span>
      <div className="room-code-row">
        <code aria-label={`Room code ${code.split('').join(' ')}`}>{code}</code>
        <button className="btn sm" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function LobbyScreen({
  room,
  session,
  connection,
  error,
  onReady,
  onCar,
  onSettings,
  onStart,
  onLeave
}: {
  room: RoomView | null;
  session: SessionInfo;
  connection: string;
  error: string | null;
  onReady: (r: boolean) => void;
  onCar: (id: string) => void;
  onSettings: (s: Partial<RoomView['settings']>) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [pickCar, setPickCar] = useState(false);
  if (!room) {
    return (
      <ScreenShell title="Joining lobby…" onBack={onLeave}>
        <div className="panel center">
          <div className="spinner" />
          <p className="muted">Connecting to room {session.code}</p>
        </div>
      </ScreenShell>
    );
  }
  const me = room.players.find((p) => p.id === session.playerId);
  const isHost = room.hostId === session.playerId;
  const connected = room.players.filter((p) => p.connected);
  const allReady = connected.every((p) => p.ready);
  const canStart = isHost && connected.length >= ROOM.MIN_PLAYERS && allReady && room.status === 'WAITING';
  const startHint =
    connected.length < ROOM.MIN_PLAYERS
      ? `Waiting for at least ${ROOM.MIN_PLAYERS} drivers — share the code`
      : !allReady
        ? 'Waiting for everyone to be ready'
        : 'All drivers ready';

  return (
    <ScreenShell title="Race lobby" eyebrow={isHost ? 'You are the host' : 'Waiting for host'} onBack={onLeave} wide>
      <ErrorNote>{error}</ErrorNote>
      {connection !== 'online' && <div className="error-note warn">Reconnecting to the server…</div>}
      <div className="setup-grid">
        <div className="panel">
          <CopyCode code={room.code} />
          <div className="lobby-settings">
            <Field label="Race duration" hint={isHost ? 'Only the host can change this' : undefined}>
              <DurationPicker value={room.settings.durationMin} disabled={!isHost} onChange={(durationMin) => onSettings({ durationMin })} />
            </Field>
            <Field label="Max players">
              <Segmented
                label="Max players"
                value={room.settings.maxPlayers}
                disabled={!isHost}
                options={Array.from({ length: ROOM.MAX_PLAYERS_LIMIT - 1 }, (_, i) => i + 2)}
                onChange={(maxPlayers) => onSettings({ maxPlayers })}
              />
            </Field>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="field-label">
              Drivers {room.players.length}/{room.settings.maxPlayers}
            </span>
          </div>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id} className={`${p.id === session.playerId ? 'me' : ''} ${p.connected ? '' : 'offline'}`}>
                <CarSprite carId={p.carId} width={64} />
                <div className="pl-name">
                  <strong>
                    {p.name}
                    {p.id === session.playerId && <span className="tag">You</span>}
                    {p.isHost && <span className="tag host">Host</span>}
                  </strong>
                  <span className="muted small">
                    {getCar(p.carId).name} · {p.connected ? 'connected' : 'reconnecting…'}
                  </span>
                </div>
                <span className={`ready-pill ${p.ready ? 'ok' : ''}`}>{p.ready ? 'READY' : 'NOT READY'}</span>
              </li>
            ))}
          </ul>
          {me && (
            <div className="row">
              {!isHost && (
                <button className={`btn ${me.ready ? 'ghost' : 'primary'}`} onClick={() => onReady(!me.ready)}>
                  {me.ready ? 'Not ready' : "I'm ready"}
                </button>
              )}
              <button className="btn ghost" onClick={() => setPickCar((v) => !v)}>
                {pickCar ? 'Done' : 'Change car'}
              </button>
            </div>
          )}
          {pickCar && me && (
            <div className="lobby-car-picker">
              <CarPicker value={me.carId} onChange={onCar} />
            </div>
          )}
        </div>
      </div>
      <div className="sticky-actions">
        {isHost ? (
          <button className="btn primary lg" disabled={!canStart} onClick={onStart}>
            Start race
          </button>
        ) : (
          <span className="muted">{room.status === 'WAITING' ? 'The host will start the race' : 'Race in progress'}</span>
        )}
        <span className="muted small">{startHint}</span>
      </div>
    </ScreenShell>
  );
}
