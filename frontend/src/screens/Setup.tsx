import { useState } from 'react';
import { BOT_LIMITS, ROOM, type Difficulty } from '@shared/index';
import { CarPicker } from '../components/CarPicker';
import { DurationPicker, ErrorNote, Field, ScreenShell, Segmented } from '../components/ui';
import type { Preferences } from '../services/storage';

function cleanName(s: string) {
  return s.replace(/[\u0000-\u001f<>]/g, '').slice(0, ROOM.NAME_MAX);
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Driver name" hint={`Up to ${ROOM.NAME_MAX} characters`}>
      <input
        className="input"
        value={value}
        maxLength={ROOM.NAME_MAX}
        placeholder="e.g. Max Keys"
        onChange={(e) => onChange(cleanName(e.target.value))}
        autoComplete="nickname"
      />
    </Field>
  );
}

export interface SoloConfig {
  name: string;
  carId: string;
  durationMin: number;
  bots: number;
  difficulty: Difficulty;
}

export function SoloSetupScreen({
  prefs,
  onPrefs,
  onStart,
  onBack
}: {
  prefs: Preferences;
  onPrefs: (p: Partial<Preferences>) => void;
  onStart: (c: SoloConfig) => void;
  onBack: () => void;
}) {
  const [durationMin, setDuration] = useState(1);
  const [bots, setBots] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const name = prefs.name.trim();
  return (
    <ScreenShell title="Single-player race" eyebrow="Setup" onBack={onBack} wide>
      <div className="setup-grid">
        <div className="panel">
          <NameField value={prefs.name} onChange={(v) => onPrefs({ name: v })} />
          <Field label="Race duration">
            <DurationPicker value={durationMin} onChange={setDuration} />
          </Field>
          <Field label={`Bot opponents: ${bots}`}>
            <input
              type="range"
              className="range"
              min={BOT_LIMITS.MIN}
              max={BOT_LIMITS.MAX}
              value={bots}
              onChange={(e) => setBots(Number(e.target.value))}
            />
          </Field>
          <Field label="Difficulty" hint="Easy ≈ 22–40 WPM · Medium ≈ 42–64 · Hard ≈ 68–98">
            <Segmented
              label="Difficulty"
              value={difficulty}
              options={['easy', 'medium', 'hard'] as const}
              onChange={setDifficulty}
              format={(v) => v[0].toUpperCase() + v.slice(1)}
            />
          </Field>
          <Field label="Sound">
            <Segmented label="Sound" value={prefs.sound ? 'On' : 'Off'} options={['On', 'Off']} onChange={(v) => onPrefs({ sound: v === 'On' })} />
          </Field>
          <Field label="Motion">
            <Segmented
              label="Reduced motion"
              value={prefs.reducedMotion}
              options={['auto', 'on', 'off'] as const}
              onChange={(v) => onPrefs({ reducedMotion: v })}
              format={(v) => (v === 'auto' ? 'System' : v === 'on' ? 'Reduced' : 'Full')}
            />
          </Field>
        </div>
        <div className="panel">
          <span className="field-label">Car</span>
          <CarPicker value={prefs.carId} onChange={(carId) => onPrefs({ carId })} />
        </div>
      </div>
      <div className="sticky-actions">
        <button
          className="btn primary lg"
          disabled={!name}
          onClick={() => onStart({ name, carId: prefs.carId, durationMin, bots, difficulty })}
        >
          Line up on the grid
        </button>
        {!name && <span className="muted small">Enter a driver name to start</span>}
      </div>
    </ScreenShell>
  );
}

export function CreateRoomScreen({
  prefs,
  onPrefs,
  onCreate,
  onBack
}: {
  prefs: Preferences;
  onPrefs: (p: Partial<Preferences>) => void;
  onCreate: (c: { name: string; carId: string; durationMin: number; maxPlayers: number }) => Promise<void>;
  onBack: () => void;
}) {
  const [durationMin, setDuration] = useState(3);
  const [maxPlayers, setMax] = useState<number>(ROOM.DEFAULT_MAX_PLAYERS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = prefs.name.trim();
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name, carId: prefs.carId, durationMin, maxPlayers });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell title="Create a private room" eyebrow="Multiplayer" onBack={onBack} wide>
      <ErrorNote>{error}</ErrorNote>
      <div className="setup-grid">
        <div className="panel">
          <NameField value={prefs.name} onChange={(v) => onPrefs({ name: v })} />
          <Field label="Race duration" hint="Applies to every driver. Locked once the race starts.">
            <DurationPicker value={durationMin} onChange={setDuration} />
          </Field>
          <Field label="Maximum players">
            <Segmented
              label="Maximum players"
              value={maxPlayers}
              options={Array.from({ length: ROOM.MAX_PLAYERS_LIMIT - 1 }, (_, i) => i + 2)}
              onChange={setMax}
            />
          </Field>
        </div>
        <div className="panel">
          <span className="field-label">Car</span>
          <CarPicker value={prefs.carId} onChange={(carId) => onPrefs({ carId })} />
        </div>
      </div>
      <div className="sticky-actions">
        <button className="btn primary lg" disabled={!name || busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </div>
    </ScreenShell>
  );
}

export function JoinRoomScreen({
  prefs,
  onPrefs,
  onJoin,
  onBack
}: {
  prefs: Preferences;
  onPrefs: (p: Partial<Preferences>) => void;
  onJoin: (c: { code: string; name: string; carId: string }) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, ROOM.CODE_LENGTH) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = prefs.name.trim();
  const valid = code.length === ROOM.CODE_LENGTH;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onJoin({ code, name, carId: prefs.carId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell title="Join a room" eyebrow="Multiplayer" onBack={onBack} wide>
      <ErrorNote>{error}</ErrorNote>
      <div className="setup-grid">
        <div className="panel">
          <Field label="Room code" hint="5 characters, not case-sensitive">
            <input
              className="input code-input"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCDE"
              maxLength={ROOM.CODE_LENGTH}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, ROOM.CODE_LENGTH))}
              onKeyDown={(e) => e.key === 'Enter' && valid && name && submit()}
            />
          </Field>
          <NameField value={prefs.name} onChange={(v) => onPrefs({ name: v })} />
        </div>
        <div className="panel">
          <span className="field-label">Car</span>
          <CarPicker value={prefs.carId} onChange={(carId) => onPrefs({ carId })} />
        </div>
      </div>
      <div className="sticky-actions">
        <button className="btn primary lg" disabled={!name || !valid || busy} onClick={submit}>
          {busy ? 'Joining…' : 'Join lobby'}
        </button>
      </div>
    </ScreenShell>
  );
}
