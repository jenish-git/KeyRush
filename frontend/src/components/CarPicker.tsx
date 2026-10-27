import { CARS, getCar } from '@shared/index';
import { CarSprite } from './CarSprite';

export function CarPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const selected = getCar(value);
  return (
    <div className="car-picker">
      <div className="car-preview">
        <div className="car-preview-stage">
          <CarSprite carId={selected.id} width={260} />
        </div>
        <div className="car-preview-meta">
          <span className="eyebrow">Selected livery</span>
          <strong>{selected.name}</strong>
          <span className="muted">#{selected.number} · cosmetic only, no performance difference</span>
        </div>
      </div>
      <div className="car-grid" role="radiogroup" aria-label="Choose your car">
        {CARS.map((car) => (
          <button
            key={car.id}
            type="button"
            role="radio"
            aria-checked={car.id === value}
            disabled={disabled}
            className={`car-option ${car.id === value ? 'selected' : ''}`}
            onClick={() => onChange(car.id)}
            title={car.name}
          >
            <CarSprite carId={car.id} width={84} />
            <span>{car.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
