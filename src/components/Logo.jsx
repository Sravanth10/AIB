import { useState } from 'react';
import { IconShield } from './Icons.jsx';

/**
 * Candidates tried in order, so the brand asset works whatever format it was saved as.
 * Drop the file into public/ under any of these names and it is picked up on next load.
 */
const CANDIDATES = [
  '/aib-life-logo.png',
  '/aib-life-logo.svg',
  '/aib-life-logo.jpg',
  '/aib-life-logo.jpeg',
  '/aib-life-logo.webp',
  '/logo.png',
  '/logo.svg',
];

/**
 * The official AIB Life logo.
 *
 * It carries its own magenta-to-purple brand box, so on the violet rail it sits on a white
 * plate rather than being dropped straight onto the gradient — standard practice for a
 * multi-colour mark on a coloured ground, and it keeps the brand reproduction clean.
 *
 * Falls back to a neutral wordmark if the asset has not been added yet, so the app never
 * renders a broken image during a demo.
 */
export default function Logo({ height = 30, plate = true, showFallbackText = true }) {
  const [attempt, setAttempt] = useState(0);
  const failed = attempt >= CANDIDATES.length;

  if (failed) {
    return (
      <div className={plate ? 'logo-plate is-fallback' : 'row'} style={{ gap: 9 }}>
        <IconShield size={height * 0.62} />
        {showFallbackText && <span className="logo-fallback-text">AIB Life</span>}
      </div>
    );
  }

  const img = (
    <img
      key={CANDIDATES[attempt]}
      src={CANDIDATES[attempt]}
      alt="AIB Life"
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      onError={() => setAttempt((n) => n + 1)}
    />
  );

  return plate ? <div className="logo-plate">{img}</div> : img;
}
