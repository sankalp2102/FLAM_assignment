import { theme } from '../theme.js';
import { dayTotals } from '../state/reducer.js';
import StopCard from './StopCard.jsx';

export default function DayPanel({ day, collapsed, onToggle, onRemoveStop, onMoveStop }) {
  const { stopCount, label } = dayTotals(day);
  const panelId = `day-panel-${day.id}`;

  return (
    <section
      style={{
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        background: theme.color.surface,
        overflow: 'hidden',
      }}
    >
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          style={{
            all: 'unset',
            boxSizing: 'border-box',
            cursor: 'pointer',
            display: 'flex',
            width: '100%',
            minHeight: theme.tap,
            padding: theme.space(4),
            gap: theme.space(3),
            alignItems: 'center',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 11,
              color: theme.color.textDim,
              transform: collapsed ? 'rotate(-90deg)' : 'none',
              transition: 'transform .15s ease',
            }}
          >
            ▼
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: theme.color.accent }}>
              Day {day.dayNumber}
            </span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{day.title}</span>
          </span>
          <span style={{ fontSize: 12, color: theme.color.textDim, whiteSpace: 'nowrap' }}>
            {stopCount} {stopCount === 1 ? 'stop' : 'stops'} · {label}
          </span>
        </button>
      </h3>

      {!collapsed && (
        <div id={panelId} style={{ padding: `0 ${theme.space(4)} ${theme.space(4)}` }}>
          {day.stops.length === 0 ? (
            <p style={{ margin: 0, color: theme.color.textDim, fontSize: 13, fontStyle: 'italic' }}>
              Every stop removed. Undo, or leave the day free.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: theme.space(2) }}>
              {day.stops.map((stop, i) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  index={i}
                  total={day.stops.length}
                  onRemove={() => onRemoveStop(stop.id)}
                  onMove={(direction) => onMoveStop(stop.id, direction)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}