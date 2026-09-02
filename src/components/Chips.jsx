import { styleFor } from '../lib/sources.js';

export function SourceChip({ sourceId, label, plain = false }) {
  const s = styleFor(sourceId);
  return (
    <span className={`src-chip${plain ? ' is-plain' : ''}`} style={plain ? undefined : { background: s.tint, color: s.colour }}>
      <span className="src-mark" style={{ background: s.colour }}>{s.mark}</span>
      {label}
    </span>
  );
}

const RAG_LABEL = { GREEN: 'On target', AMBER: 'At risk', RED: 'Breach', NO_DATA: 'No data' };

export function Rag({ status, compact = false }) {
  return (
    <span className={`rag rag-${status}`}>
      <span className="rag-dot" />
      {compact ? status.replace('_', ' ') : RAG_LABEL[status]}
    </span>
  );
}

export function CreditTag() {
  return <span className="credit-tag">Service credit</span>;
}
