import { CarSprite } from '../components/CarSprite';
import { LogoMark } from '../components/Logo';
import { ErrorNote, ScreenShell } from '../components/ui';
import { sound } from '../services/sound';

export function WelcomeScreen({ onStart, onStats }: { onStart: () => void; onStats: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome-lights" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </div>
      <div className="welcome-body">
        <LogoMark size={96} />
        <h1 className="logo">
          KEY<em>RUSH</em>
        </h1>
        <span className="eyebrow">The typing Grand Prix</span>
        <p className="lead">Your keyboard is the throttle. Type fast, stay clean, and fight for P1 against bots or friends.</p>
        <div className="welcome-car" aria-hidden>
          <CarSprite carId="scarlet" width={300} />
        </div>
        <div className="row center">
          <button
            className="btn primary lg"
            onClick={() => {
              sound.unlock();
              onStart();
            }}
          >
            Enter the paddock
          </button>
          <button className="btn ghost lg" onClick={onStats}>
            Stats & history
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModeSelectScreen({
  onSolo,
  onCreate,
  onJoin,
  onBack,
  notice
}: {
  onSolo: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onBack: () => void;
  notice: string | null;
}) {
  return (
    <ScreenShell title="Choose your session" eyebrow="Race control" onBack={onBack}>
      <ErrorNote>{notice}</ErrorNote>
      <div className="mode-grid">
        <button className="mode-card" onClick={onSolo}>
          <span className="mode-tag">Single player</span>
          <strong>Race the bots</strong>
          <span className="muted">1–9 AI drivers with realistic typing, mistakes and corrections. Easy, medium or hard.</span>
        </button>
        <button className="mode-card" onClick={onCreate}>
          <span className="mode-tag">Multiplayer</span>
          <strong>Create a room</strong>
          <span className="muted">Host a private race, set the duration and share a join code with friends.</span>
        </button>
        <button className="mode-card" onClick={onJoin}>
          <span className="mode-tag">Multiplayer</span>
          <strong>Join a room</strong>
          <span className="muted">Got a code? Jump into a friend's lobby and line up on the grid.</span>
        </button>
      </div>
    </ScreenShell>
  );
}
