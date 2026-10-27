import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { type Theme } from '@shared/index';
import { mp } from './net/mpClient';
import { SoloRace } from './race/controller';
import { LobbyScreen } from './screens/Lobby';
import { ModeSelectScreen, WelcomeScreen } from './screens/Menus';
import { RaceScreen } from './screens/RaceScreen';
import { ResultsScreen } from './screens/Results';
import { CreateRoomScreen, JoinRoomScreen, SoloSetupScreen, type SoloConfig } from './screens/Setup';
import { StatsScreen } from './screens/Stats';
import { usePrefersReducedMotion } from './hooks/useViewport';
import { recordRace } from './services/history';
import { sound } from './services/sound';
import { loadPrefs, recentSoloThemes, savePrefs, sessionStore, setRecentSoloThemes, type Preferences } from './services/storage';

type Screen = 'welcome' | 'mode' | 'solo-setup' | 'solo-race' | 'solo-results' | 'create' | 'join' | 'mp' | 'stats';

export function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    sessionStore.get() ? 'mp' : new URLSearchParams(location.search).get('room') ? 'join' : 'welcome'
  );
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [solo, setSolo] = useState<{ race: SoloRace; config: SoloConfig } | null>(null);
  const mpState = useSyncExternalStore(mp.subscribe, mp.getSnapshot);
  const systemReduced = usePrefersReducedMotion();
  const reducedMotion = prefs.reducedMotion === 'auto' ? systemReduced : prefs.reducedMotion === 'on';

  const updatePrefs = useCallback((p: Partial<Preferences>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => sound.setEnabled(prefs.sound), [prefs.sound]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);

  // Restore a multiplayer seat after a page refresh.
  useEffect(() => {
    if (sessionStore.get() && !mp.state.room && !mp.state.rejoining) void mp.resume();
  }, []);

  // A closed/expired room sends the player back to mode selection.
  useEffect(() => {
    // Read the live store: resume() may have adopted a session during this commit.
    const live = mp.state;
    if (screen === 'mp' && !live.session && !live.rejoining && !live.results) setScreen('mode');
  }, [screen, mpState.session, mpState.rejoining, mpState.results]);

  const startSolo = (config: SoloConfig) => {
    solo?.race.dispose();
    const race: SoloRace = new SoloRace(
      { ...config, avoidThemes: recentSoloThemes() as Theme[] },
      (summary) => {
        void recordRace(summary, race.selfId);
        setTimeout(() => setScreen('solo-results'), 1200);
      }
    );
    setRecentSoloThemes(race.themes);
    setSolo({ race, config });
    setScreen('solo-race');
  };

  const toMenu = () => {
    solo?.race.dispose();
    setSolo(null);
    if (mpState.session) mp.leave();
    setScreen('mode');
  };

  const createRoom = async (c: { name: string; carId: string; durationMin: number; maxPlayers: number }) => {
    await mp.create(c.name, c.carId, { durationMin: c.durationMin, maxPlayers: c.maxPlayers });
    setScreen('mp');
  };
  const joinRoom = async (c: { code: string; name: string; carId: string }) => {
    await mp.join(c.code, c.name, c.carId);
    if (location.search) history.replaceState(null, '', location.pathname);
    setScreen('mp');
  };

  let content: JSX.Element;
  switch (screen) {
    case 'welcome':
      content = <WelcomeScreen onStart={() => setScreen('mode')} onStats={() => setScreen('stats')} />;
      break;
    case 'mode':
      content = (
        <ModeSelectScreen
          notice={mpState.notice}
          onBack={() => setScreen('welcome')}
          onSolo={() => {
            mp.clearMessages();
            setScreen('solo-setup');
          }}
          onCreate={() => {
            mp.clearMessages();
            setScreen('create');
          }}
          onJoin={() => {
            mp.clearMessages();
            setScreen('join');
          }}
        />
      );
      break;
    case 'stats':
      content = <StatsScreen onBack={() => setScreen('welcome')} />;
      break;
    case 'solo-setup':
      content = <SoloSetupScreen prefs={prefs} onPrefs={updatePrefs} onStart={startSolo} onBack={() => setScreen('mode')} />;
      break;
    case 'solo-race':
      content = solo ? (
        <RaceScreen
          key={solo.race.sim.raceId}
          race={solo.race}
          title={`Solo GP · ${solo.config.difficulty.toUpperCase()}`}
          reducedMotion={reducedMotion}
          soundOn={prefs.sound}
          onToggleSound={() => updatePrefs({ sound: !prefs.sound })}
          onExit={toMenu}
        />
      ) : (
        <></>
      );
      if (!solo) setTimeout(() => setScreen('mode'));
      break;
    case 'solo-results':
      content =
        solo && solo.race.summary ? (
          <ResultsScreen
            summary={solo.race.summary}
            selfId={solo.race.selfId}
            reactionMs={solo.race.reactionMs}
            onRaceAgain={() => startSolo(solo.config)}
            onNewRoom={() => setScreen('create')}
            onMenu={toMenu}
          />
        ) : (
          <></>
        );
      break;
    case 'create':
      content = <CreateRoomScreen prefs={prefs} onPrefs={updatePrefs} onCreate={createRoom} onBack={() => setScreen('mode')} />;
      break;
    case 'join':
      content = <JoinRoomScreen prefs={prefs} onPrefs={updatePrefs} onJoin={joinRoom} onBack={() => setScreen('mode')} />;
      break;
    case 'mp': {
      const { race, results, session, room } = mpState;
      if (race && results && race.finished) {
        content = (
          <ResultsScreen
            summary={results}
            selfId={race.selfId}
            reactionMs={race.reactionMs}
            onLobby={session ? () => mp.backToLobby() : undefined}
            onNewRoom={() => {
              mp.leave();
              setScreen('create');
            }}
            onMenu={toMenu}
          />
        );
      } else if (race && session) {
        content = (
          <RaceScreen
            key={race.raceId}
            race={race}
            title={`Room ${session.code}`}
            connection={mpState.connection}
            reducedMotion={reducedMotion}
            soundOn={prefs.sound}
            onToggleSound={() => updatePrefs({ sound: !prefs.sound })}
            onExit={toMenu}
          />
        );
      } else if (session) {
        content = (
          <LobbyScreen
            room={room}
            session={session}
            connection={mpState.connection}
            error={mpState.error}
            onReady={(r) => mp.ready(r)}
            onCar={(id) => {
              mp.selectCar(id);
              updatePrefs({ carId: id });
            }}
            onSettings={(s) => mp.updateSettings(s)}
            onStart={() => mp.start()}
            onLeave={toMenu}
          />
        );
      } else {
        content = (
          <div className="screen">
            <div className="screen-inner center">
              <div className="spinner" />
              <p className="muted">Reconnecting to your room…</p>
            </div>
          </div>
        );
      }
      break;
    }
  }

  return (
    <div className={`app ${screen === 'solo-race' || (screen === 'mp' && mpState.race && !mpState.race.finished) ? 'in-race' : ''}`}>
      <button
        className="mute-toggle"
        aria-label={prefs.sound ? 'Mute sound' : 'Unmute sound'}
        aria-pressed={!prefs.sound}
        onClick={() => {
          updatePrefs({ sound: !prefs.sound });
          if (!prefs.sound) sound.unlock();
        }}
      >
        {prefs.sound ? '🔊' : '🔇'}
      </button>
      {content}
    </div>
  );
}
