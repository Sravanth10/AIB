/**
 * The reference upload UIs put a progress ring on each file. Here the ring shows something
 * worth watching: how sure the system is about what the document actually IS. Upload
 * progress is meaningless on a local file; classification confidence is the whole story.
 */
export default function ConfidenceRing({ value, size = 46, working = false, locked = false }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value ?? 0));
  const offset = circumference * (1 - (working ? 0.22 : pct));

  return (
    <div className="ring-wrap" style={{ width: size, height: size, flexBasis: size }}>
      <svg width={size} height={size} className={working ? 'is-spinning' : undefined}
           style={working ? { animation: 'spin 1.1s linear infinite' } : undefined}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={`ring-value${locked ? ' is-locked' : pct < 0.8 ? ' is-low' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">
        {working ? <small>···</small> : <span>{Math.round(pct * 100)}<small>%</small></span>}
      </div>
    </div>
  );
}
