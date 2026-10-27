import { getCar, type RaceResult, type RaceSummary } from '@shared/index';
import { CarSprite } from '../components/CarSprite';
import { CopyCode } from './Lobby';

function fmtMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Podium({ results, selfId }: { results: RaceResult[]; selfId: string }) {
  const top = results.slice(0, 3);
  // Visual order: P2, P1, P3 (adapts for 1–2 finishers).
  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  return (
    <div className={`podium n${top.length}`}>
      {order.map((r) => (
        <div key={r.id} className={`podium-step p${r.position} ${r.id === selfId ? 'me' : ''}`} style={{ animationDelay: `${(3 - r.position) * 0.25}s` }}>
          <div className="podium-car">
            <CarSprite carId={r.carId} width={110} />
          </div>
          <strong className="podium-name">{r.id === selfId ? `${r.name} (you)` : r.name}</strong>
          <span className="podium-wpm">{r.effectiveWpm} WPM</span>
          <div className="podium-block">
            <span>P{r.position}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsScreen({
  summary,
  selfId,
  reactionMs,
  onRaceAgain,
  onLobby,
  onNewRoom,
  onMenu
}: {
  summary: RaceSummary;
  selfId: string;
  reactionMs: number | null;
  onRaceAgain?: () => void;
  onLobby?: () => void;
  onNewRoom?: () => void;
  onMenu: () => void;
}) {
  const me = summary.results.find((r) => r.id === selfId);
  return (
    <div className="screen results">
      <div className="screen-inner wide">
        <header className="screen-head">
          <div>
            <span className="eyebrow">
              {summary.mode === 'solo' ? `Single player · ${summary.difficulty} bots` : `Room ${summary.roomCode}`} · {summary.durationMin} min
            </span>
            <h1>{me ? `You finished P${me.position}` : 'Race results'}</h1>
          </div>
        </header>

        <Podium results={summary.results} selfId={selfId} />

        {me && (
          <div className="result-cards">
            <Stat label="Effective WPM" value={me.effectiveWpm} accent />
            <Stat label="Raw WPM" value={me.rawWpm} />
            <Stat label="Accuracy" value={`${me.accuracy}%`} />
            <Stat label="Correct chars" value={me.correctChars} />
            <Stat label="Errors" value={me.totalErrors} />
            <Stat label="Corrected" value={me.correctedErrors} />
            <Stat label="Crashes" value={me.crashes} />
            <Stat label="Reaction" value={reactionMs !== null ? `${(reactionMs / 1000).toFixed(3)}s` : '—'} />
          </div>
        )}

        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Driver</th>
                <th className="num">Eff. WPM</th>
                <th className="num">Raw</th>
                <th className="num">Acc.</th>
                <th className="num hide-sm">Correct</th>
                <th className="num hide-sm">Errors</th>
                <th className="num hide-sm">Fixed</th>
                <th className="num">Distance</th>
                <th className="hide-sm">Time</th>
              </tr>
            </thead>
            <tbody>
              {summary.results.map((r, i) => (
                <tr key={r.id} className={r.id === selfId ? 'me' : ''} style={{ animationDelay: `${0.6 + i * 0.06}s` }}>
                  <td className="pos">P{r.position}</td>
                  <td>
                    <span className="driver-cell">
                      <span className="bar" style={{ background: getCar(r.carId).body }} />
                      {r.name}
                      {r.isBot && <span className="tag">BOT</span>}
                      {r.falseStart && <span className="tag warn">JUMP</span>}
                      {r.status !== 'racing' && <span className="tag">{r.status === 'abandoned' ? 'DNF' : 'DISC'}</span>}
                    </span>
                  </td>
                  <td className="num strong">{r.effectiveWpm}</td>
                  <td className="num">{r.rawWpm}</td>
                  <td className="num">{r.accuracy}%</td>
                  <td className="num hide-sm">{r.correctChars}</td>
                  <td className="num hide-sm">{r.totalErrors}</td>
                  <td className="num hide-sm">{r.correctedErrors}</td>
                  <td className="num">{Math.round(r.distance)}</td>
                  <td className="hide-sm">{fmtMs(r.raceTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Ranking: distance covered, then effective WPM, then accuracy. Distance is measured in passage characters.
        </p>

        {summary.mode === 'multiplayer' && summary.roomCode && <CopyCode code={summary.roomCode} />}

        <div className="sticky-actions">
          {onRaceAgain && (
            <button className="btn primary lg" onClick={onRaceAgain}>
              Race again
            </button>
          )}
          {onLobby && (
            <button className="btn primary lg" onClick={onLobby}>
              Return to lobby
            </button>
          )}
          {onNewRoom && (
            <button className="btn ghost" onClick={onNewRoom}>
              Create another room
            </button>
          )}
          <button className="btn ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
