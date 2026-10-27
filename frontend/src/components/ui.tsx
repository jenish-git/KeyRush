import type { ReactNode } from 'react';
import { RACE_DURATIONS_MIN } from '@shared/index';
import { Logo } from './Logo';

export function ScreenShell({
  title,
  eyebrow,
  onBack,
  children,
  wide
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="screen">
      <div className={`screen-inner ${wide ? 'wide' : ''}`}>
        <header className="screen-head">
          {onBack && (
            <button className="btn ghost sm back" onClick={onBack} aria-label="Back">
              ← Back
            </button>
          )}
          <div className="screen-title">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
          </div>
          <Logo size={30} className="screen-brand" />
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  format
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  format?: (v: T) => string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o)}
          role="radio"
          aria-checked={o === value}
          disabled={disabled}
          className={o === value ? 'active' : ''}
          onClick={() => onChange(o)}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function DurationPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <Segmented
      label="Race duration"
      value={value}
      options={RACE_DURATIONS_MIN as readonly number[]}
      onChange={onChange}
      disabled={disabled}
      format={(v) => `${v} min`}
    />
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="error-note" role="alert">
      {children}
    </div>
  );
}
