/**
 * Design tokens. Inline styles read from here so every component shares one
 * scale instead of inventing its own padding and greys.
 */
export const theme = {
  color: {
    bg: '#0f1115',
    surface: '#171a21',
    surfaceAlt: '#1e222b',
    border: '#2a2f3a',
    text: '#e8eaed',
    textDim: '#9aa3b2',
    accent: '#7c9cff',
    accentDim: '#2a3558',
    danger: '#ff6b6b',
    warn: '#f0b429',
    ok: '#4ade80',
  },
  space: (n) => `${n * 4}px`,
  radius: { sm: '6px', md: '10px', lg: '16px' },
  font: {
    stack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  // 44px minimum touch target — mobile is a hard requirement.
  tap: '44px',
};

export const categoryMeta = {
  food: { label: 'Food', icon: '🍽', color: '#f0b429' },
  sight: { label: 'Sight', icon: '🏛', color: '#7c9cff' },
  activity: { label: 'Activity', icon: '🎟', color: '#4ade80' },
  transit: { label: 'Transit', icon: '🚇', color: '#9aa3b2' },
  rest: { label: 'Rest', icon: '☕️', color: '#c084fc' },
  lodging: { label: 'Stay', icon: '🛏', color: '#38bdf8' },
};
