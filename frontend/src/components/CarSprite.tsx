import { getCar } from '@shared/index';

/** SVG version of the canvas car (see game/cars/drawCar.ts). */
export function CarSprite({ carId, width = 120, title }: { carId: string; width?: number; title?: string }) {
  const car = getCar(carId);
  return (
    <svg viewBox="0 0 100 40" width={width} height={(width * 40) / 100} role="img" aria-label={title ?? car.name}>
      <rect x="6" y="6" width="92" height="32" rx="8" fill="rgba(0,0,0,0.35)" />
      <g fill="#121212">
        <rect x="14" y="0" width="15" height="9" rx="2.5" />
        <rect x="14" y="31" width="15" height="9" rx="2.5" />
        <rect x="64" y="1" width="12" height="8" rx="2.5" />
        <rect x="64" y="31" width="12" height="8" rx="2.5" />
      </g>
      <rect x="2" y="5" width="9" height="30" rx="2" fill={car.accent} />
      <path d="M11 13 L30 10 L56 11 L72 15 L96 18 L96 22 L72 25 L56 29 L30 30 L11 27 Z" fill={car.body} />
      <rect x="14" y="18.6" width="80" height="2.8" fill={car.stripe} />
      <rect x="89" y="3" width="8" height="34" rx="2" fill={car.accent} />
      <ellipse cx="50" cy="20" rx="8" ry="4.6" fill="#0d0d0f" />
      <ellipse cx="51" cy="20" rx="9.5" ry="5.6" fill="none" stroke="#3a3d42" strokeWidth="1.6" />
      <text x="30" y="23.5" fontSize="9" fontWeight="700" textAnchor="middle" fill={car.accent} fontFamily="Barlow Condensed, sans-serif">
        {car.number}
      </text>
      <rect x="0" y="17.5" width="3" height="5" fill="#5a0d0d" />
    </svg>
  );
}

export function CarSwatch({ carId }: { carId: string }) {
  const car = getCar(carId);
  return <span className="car-swatch" style={{ background: car.body, borderColor: car.accent }} aria-hidden />;
}
