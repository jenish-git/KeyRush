import { useEffect, useState } from 'react';
import { ScreenShell } from '../components/ui';
import { fetchHistory } from '../services/history';
import type { LocalHistoryEntry } from '../services/storage';

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<{ loading: boolean; entries: LocalHistoryEntry[]; serverOk: boolean }>({
    loading: true,
    entries: [],
    serverOk: true
  });

  useEffect(() => {
    let alive = true;
    fetchHistory().then((r) => alive && setState({ loading: false, ...r }));
    return () => {
      alive = false;
    };
  }, []);

  const rows = state.entries
    .map((e) => ({ e, me: e.summary.results.find((r) => r.id === e.playerId) }))
    .filter((x) => x.me);
  const wpms = rows.map((x) => x.me!.effectiveWpm);
  const best = wpms.length ? Math.max(...wpms) : 0;
  const avg = wpms.length ? wpms.reduce((a, b) => a + b, 0) / wpms.length : 0;
  const acc = rows.length ? rows.reduce((a, x) => a + x.me!.accuracy, 0) / rows.length : 0;
  const wins = rows.filter((x) => x.me!.position === 1).length;

  return (
    <ScreenShell title="Driver statistics" eyebrow="Career" onBack={onBack} wide>
      {!state.serverOk && !state.loading && (
        <div className="error-note warn">The server history is unavailable right now — showing races saved on this device.</div>
      )}
      <div className="result-cards">
        <div className="stat accent">
          <span className="stat-label">Races</span>
          <span className="stat-value">{rows.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Wins</span>
          <span className="stat-value">{wins}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Best WPM</span>
          <span className="stat-value">{best.toFixed(1)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg WPM</span>
          <span className="stat-value">{avg.toFixed(1)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg accuracy</span>
          <span className="stat-value">{acc.toFixed(1)}%</span>
        </div>
      </div>
      {state.loading ? (
        <div className="panel center">
          <div className="spinner" />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel center empty">
          <strong>No races yet</strong>
          <span className="muted">Finish a race and it will appear here.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th className="num">Pos</th>
                <th className="num">Eff. WPM</th>
                <th className="num">Acc.</th>
                <th className="num hide-sm">Errors</th>
                <th className="hide-sm">Length</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, me }) => (
                <tr key={e.summary.raceId}>
                  <td>{new Date(e.summary.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {e.summary.mode === 'solo' ? `Solo · ${e.summary.difficulty}` : `Room ${e.summary.roomCode}`}
                  </td>
                  <td className="num">
                    P{me!.position}/{e.summary.results.length}
                  </td>
                  <td className="num strong">{me!.effectiveWpm}</td>
                  <td className="num">{me!.accuracy}%</td>
                  <td className="num hide-sm">{me!.totalErrors}</td>
                  <td className="hide-sm">{e.summary.durationMin} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ScreenShell>
  );
}
