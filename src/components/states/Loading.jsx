import { theme } from '../../theme.js';

/**
 * Skeleton shaped like the real result, not a spinner. A spinner tells you
 * something is happening; this tells you what is arriving.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: theme.space(3) }}>
      <span style={{ position: 'absolute', left: -9999 }}>Generating your itinerary</span>
      <Bar w="62%" h={26} />
      <Bar w="88%" h={14} />
      {[0, 1, 2].map((d) => (
        <div
          key={d}
          style={{
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.lg,
            padding: theme.space(4),
            background: theme.color.surface,
            display: 'grid',
            gap: theme.space(3),
          }}
        >
          <Bar w="40%" h={18} />
          {[0, 1].map((s) => (
            <div key={s} style={{ display: 'flex', gap: theme.space(3), alignItems: 'center' }}>
              <Bar w={36} h={36} r="50%" />
              <div style={{ flex: 1, display: 'grid', gap: theme.space(2) }}>
                <Bar w="55%" h={14} />
                <Bar w="80%" h={11} />
              </div>
            </div>
          ))}
        </div>
      ))}
      <style>{`@keyframes tp-pulse { 0%,100% { opacity: .35 } 50% { opacity: .7 } }`}</style>
    </div>
  );
}

const Bar = ({ w, h, r }) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: r ?? theme.radius.sm,
      background: theme.color.surfaceAlt,
      animation: 'tp-pulse 1.4s ease-in-out infinite',
      flexShrink: 0,
    }}
  />
);