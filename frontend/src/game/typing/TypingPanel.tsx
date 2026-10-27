import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { cursorIndex, progress } from '@shared/index';
import type { RaceController } from '../../race/controller';
import { sound } from '../../services/sound';

// ---------------------------------------------------------------- passage

const CHUNK = 240;
const MAX_SINGLE_INSERT = 24;

/** Split text into chunks that end on spaces, so only the active chunk re-renders. */
function chunkText(text: string): { start: number; text: string }[] {
  const chunks: { start: number; text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + CHUNK);
    if (end < text.length) {
      const sp = text.lastIndexOf(' ', end);
      if (sp > i) end = sp + 1;
    }
    chunks.push({ start: i, text: text.slice(i, end) });
    i = end;
  }
  return chunks;
}

interface ChunkProps {
  start: number;
  text: string;
  /** Clamped to the chunk: [start, done) correct, [done, cur) errors, cur = cursor. */
  done: number;
  cur: number;
  hasCursor: boolean;
}

const Chunk = memo(function Chunk({ start, text, done, cur, hasCursor }: ChunkProps) {
  const end = start + text.length;
  const parts = [];
  if (done > start) parts.push(<span key="d" className="ch-done">{text.slice(0, done - start)}</span>);
  for (let i = done; i < cur; i++) {
    const c = text[i - start];
    parts.push(
      <span key={`e${i}`} className={`ch-err ${c === ' ' ? 'space' : ''}`}>
        {c}
      </span>
    );
  }
  if (hasCursor && cur < end) {
    parts.push(
      <span key="c" className="ch-cursor" data-cursor="1">
        {text[cur - start]}
      </span>
    );
    if (cur + 1 < end) parts.push(<span key="u">{text.slice(cur + 1 - start)}</span>);
  } else if (cur < end) {
    parts.push(<span key="u">{text.slice(cur - start)}</span>);
  }
  return <>{parts}</>;
});

function Passage({ text, prog, cursor, reducedMotion }: { text: string; prog: number; cursor: number; reducedMotion: boolean }) {
  const chunks = useMemo(() => chunkText(text), [text]);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastTop = useRef(-1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>('[data-cursor]');
    if (!box || !el) return;
    const top = el.offsetTop;
    if (top === lastTop.current) return; // only scroll when the cursor changes line
    lastTop.current = top;
    const target = Math.max(0, top - box.clientHeight * 0.3);
    box.scrollTo({ top: target, behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  return (
    <div className="passage" ref={boxRef}>
      <p>
        {chunks.map((c) => {
          const end = c.start + c.text.length;
          const done = Math.min(Math.max(prog, c.start), end);
          const cur = Math.min(Math.max(cursor, c.start), end);
          return <Chunk key={c.start} start={c.start} text={c.text} done={done} cur={cur} hasCursor={cursor >= c.start && cursor < end} />;
        })}
      </p>
    </div>
  );
}

// ------------------------------------------------------------ typing input

/**
 * Controlled hidden input. Instead of relying on keydown, every `input` event
 * is diffed against the previous value: deletions become backspaces and new
 * characters are typed in order. This works for desktop keyboards, mobile
 * virtual keyboards and IME composition alike. The input only ever contains
 * the current, uncommitted word.
 */
export function TypingPanel({
  race,
  reducedMotion,
  active,
  keyboardOpen = true
}: {
  race: RaceController;
  reducedMotion: boolean;
  active: boolean;
  keyboardOpen?: boolean;
}) {
  useSyncExternalStore(race.subscribe.bind(race), () => race.version);
  const inputRef = useRef<HTMLInputElement>(null);
  const prev = useRef('');
  const composing = useRef(false);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(0);
  const [pasteWarn, setPasteWarn] = useState(false);

  const isTouchDevice = useMemo(() => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches, []);
  const isEffectivelyFocused = isTouchDevice ? (focused && keyboardOpen) : focused;

  const focusInput = useCallback(() => {
    sound.unlock();
    const el = inputRef.current;
    if (!el) return;
    // On mobile devices, when the user scrolls or dismisses the virtual keyboard,
    // the OS hides the keyboard while document.activeElement might still remain on
    // this input. Blurring first ensures calling focus() creates a genuine user-activation
    // focus transition that reliably re-summons the software keyboard.
    if (document.activeElement === el) {
      el.blur();
    }
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    setFocused(true);
  }, []);

  const typing = race.typing;
  const prog = progress(typing);
  const cursor = cursorIndex(typing);

  const syncValue = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const want = race.typing.entries;
    if (el.value !== want && !composing.current) el.value = want;
    prev.current = composing.current ? el.value : want;
  }, [race]);

  // Keep the input in sync after authoritative corrections (resync, word commit).
  useEffect(() => {
    syncValue();
  });

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus({ preventScroll: true });
    // Any printable key refocuses the input if focus was lost (desktop).
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t !== inputRef.current && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const native = e.nativeEvent as InputEvent;
    const value = el.value;
    const before = prev.current;
    if (native.inputType === 'insertFromPaste' || native.inputType === 'insertFromDrop') {
      el.value = before;
      setPasteWarn(true);
      return;
    }
    let i = 0;
    while (i < before.length && i < value.length && before[i] === value[i]) i++;
    const dels = before.length - i;
    const ins = value.slice(i);
    // Large jumps are pastes/autofill: reject them. A word-sized insert is
    // allowed because mobile predictive-text taps insert whole words.
    if (ins.length > MAX_SINGLE_INSERT) {
      el.value = before;
      setPasteWarn(true);
      return;
    }
    const ops = '\b'.repeat(dels) + ins;
    if (!ops) return;
    sound.unlock();
    const errsBefore = race.typing.errorKeystrokes;
    race.handleOps(ops);
    if (race.typing.errorKeystrokes > errsBefore) {
      sound.mistake();
      setFlash((n) => n + 1);
    }
    prev.current = value;
    if (!composing.current) syncValue();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Held keys do not auto-repeat characters into the race.
    if (e.repeat && e.key.length === 1) e.preventDefault();
    if (['Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && ['a', 'z', 'y'].includes(e.key.toLowerCase())) e.preventDefault();
  };

  const keepCaretAtEnd = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const n = el.value.length;
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n);
  };

  const now = race.now();
  const locked = race.falseStart && now < race.lockedUntil;
  const textPct = Math.min(100, (prog / Math.max(1, race.text.length)) * 100);

  return (
    <div
      className={`typing-panel ${isEffectivelyFocused ? 'focused' : ''} ${typing.firstError !== -1 ? 'has-error' : ''}`}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && /^(BUTTON|A|INPUT)$/.test(target.tagName)) return;
        focusInput();
      }}
    >
      <div className="typing-head">
        <span className="eyebrow">Passage</span>
        <span className="typing-progress-label">{prog.toLocaleString()} chars</span>
      </div>
      <div className="typing-progress" aria-hidden>
        <span style={{ width: `${textPct}%` }} />
      </div>
      <div className="passage-wrap">
        {flash > 0 && <span key={flash} className="error-flash" aria-hidden />}
        <Passage text={race.text} prog={prog} cursor={cursor} reducedMotion={reducedMotion} />
        {!isEffectivelyFocused && active && !race.finished && (
          <label
            htmlFor="race-typing-input"
            className="focus-hint"
            onClick={(e) => {
              e.stopPropagation();
              focusInput();
            }}
          >
            <span>{isTouchDevice ? 'Tap here to type' : 'Click here or press any key to type'}</span>
          </label>
        )}
      </div>
      <div className="typing-foot">
        {locked ? (
          <span className="badge danger">Jump start — penalty</span>
        ) : typing.firstError !== -1 ? (
          <span className="badge warn">Fix the error — backspace</span>
        ) : pasteWarn ? (
          <span className="badge">Pasting is disabled</span>
        ) : (
          <span className="muted small">{isEffectivelyFocused ? 'Typing…' : 'Input not focused'}</span>
        )}
      </div>
      <input
        id="race-typing-input"
        ref={inputRef}
        className="typing-input"
        aria-label="Type the passage here"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="next"
        disabled={race.finished}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onSelect={keepCaretAtEnd}
        onPaste={(e) => {
          e.preventDefault();
          setPasteWarn(true);
        }}
        onDrop={(e) => e.preventDefault()}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          // Some browsers fire compositionend after the final input event.
          prev.current = e.currentTarget.value;
          syncValue();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
