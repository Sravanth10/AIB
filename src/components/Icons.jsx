const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconCloud = ({ size = 42 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={1.4}>
    <path d="M6.5 18.5A4.5 4.5 0 0 1 6 9.6a6 6 0 0 1 11.6-1.2A4 4 0 0 1 18 18.5" />
    <path d="M12 21V11.2M12 11.2 9.2 14M12 11.2 14.8 14" />
  </svg>
);

export const IconLayers = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
  </svg>
);

export const IconGrid = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
    <path d="M3 9h18M9.5 9v11.5" />
  </svg>
);

export const IconAlert = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 4.2 2.8 20h18.4L12 4.2Z" />
    <path d="M12 10v4.2M12 17.4h.01" />
  </svg>
);

export const IconDoc = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

export const IconCheck = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconCircleCheck = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.3 2.7 2.7L16 9.5" strokeWidth={2} />
  </svg>
);

export const IconCircleDash = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeDasharray="3 3">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

export const IconX = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconClock = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.2V12l3.2 1.9" />
  </svg>
);

export const IconInfo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.2M12 7.8h.01" />
  </svg>
);

export const IconSpark = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M3 17.5 8.5 11l4 3.6L21 6" />
    <path d="M15.6 6H21v5.2" />
  </svg>
);

export const IconDownload = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 3.5v11M12 14.5 8 10.6M12 14.5l4-3.9M4.5 17.5v1.6a1.4 1.4 0 0 0 1.4 1.4h12.2a1.4 1.4 0 0 0 1.4-1.4v-1.6" />
  </svg>
);

export const IconWand = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M4 20 15 9M13.5 4.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2ZM19.4 12l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4Z" />
  </svg>
);

export const IconShield = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 2.8 4.5 6v6c0 4.4 3.1 8.2 7.5 9.2 4.4-1 7.5-4.8 7.5-9.2V6L12 2.8Z" />
    <path d="m8.8 12 2.3 2.3 4.1-4.6" />
  </svg>
);
