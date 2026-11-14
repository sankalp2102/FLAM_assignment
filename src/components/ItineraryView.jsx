import { theme } from '../theme.js';
import DayPanel from './DayPanel.jsx';

export default function ItineraryView({ state, meta, dispatch }) {
  const { itinerary, collapsed, lastRemoved } = state;
  const allCollapsed = itinerary.days.every((d) => collapsed[d.id]);
  const totalStops = itinerary.days.reduce((n, d) => n + d.stops.length, 0);

  return (
    <div style={{ display: 'grid', gap: theme.space(4) }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.3 }}>{itinerary.trip.title}</h2>
        {itinerary.trip.summary && (
          <p style={{ margin: `${theme.space(2)} 0 0`, color: theme.color.textDim, fontSize: 14, lineHeight: 1.5 }}>
            {itinerary.trip.summary}
          </p>
        )}
        <div style={{ marginTop: theme.space(3), display: 'flex', gap: theme.space(3), alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: theme.color.textDim }}>
          <span>
            {itinerary.days.length} {itinerary.days.length === 1 ? 'day' : 'days'} · {totalStops} stops
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_ALL_COLLAPSED', value: !allCollapsed })}
            style={{
              minHeight: 32,
              padding: `0 ${theme.space(3)}`,
              background: 'transparent',
              color: theme.color.textDim,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              fontSize: 12,
            }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      </header>

      {/* Non-fatal casualties from validation. Surfaced rather than hidden:
          the user should know the model gave us something we had to drop. */}
      {meta?.droppedIssues?.length > 0 && (
        <details
          style={{
            border: `1px solid ${theme.color.warn}55`,
            background: `${theme.color.warn}0f`,
            borderRadius: theme.radius.md,
            padding: theme.space(3),
            fontSize: 13,
          }}
        >
          <summary style={{ cursor: 'pointer', color: theme.color.warn }}>
            {meta.droppedIssues.length} item{meta.droppedIssues.length === 1 ? '' : 's'} from the model
            couldn't be used
          </summary>
          <ul style={{ margin: `${theme.space(2)} 0 0`, paddingLeft: theme.space(5), fontFamily: theme.font.mono, fontSize: 11, color: theme.color.textDim }}>
            {meta.droppedIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
      )}

      {meta?.repaired && (
        <p style={{ margin: 0, fontSize: 12, color: theme.color.textDim }}>
          The first response failed validation; this is the model's corrected attempt.
        </p>
      )}

      <div style={{ display: 'grid', gap: theme.space(3) }}>
        {itinerary.days.map((day) => (
          <DayPanel
            key={day.id}
            day={day}
            collapsed={!!collapsed[day.id]}
            onToggle={() => dispatch({ type: 'TOGGLE_DAY', dayId: day.id })}
            onRemoveStop={(stopId) => dispatch({ type: 'REMOVE_STOP', dayId: day.id, stopId })}
            onMoveStop={(stopId, direction) => dispatch({ type: 'MOVE_STOP', dayId: day.id, stopId, direction })}
          />
        ))}
      </div>

      {/* Undo rather than a confirm dialog: removing one stop is cheap to
          reverse, and a prompt on every delete would be worse than the mistake. */}
      {lastRemoved && (
        <div
          role="status"
          style={{
            position: 'sticky',
            bottom: theme.space(3),
            display: 'flex',
            gap: theme.space(3),
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.space(3),
            background: theme.color.surfaceAlt,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          }}
        >
          <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Removed “{lastRemoved.stop.name}”
          </span>
          <span style={{ display: 'flex', gap: theme.space(2), flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'UNDO_REMOVE' })}
              style={{
                minHeight: 34,
                padding: `0 ${theme.space(3)}`,
                background: theme.color.accent,
                color: theme.color.bg,
                border: 'none',
                borderRadius: theme.radius.sm,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'DISMISS_UNDO' })}
              aria-label="Dismiss"
              style={{
                minHeight: 34,
                width: 34,
                background: 'transparent',
                color: theme.color.textDim,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.sm,
              }}
            >
              ×
            </button>
          </span>
        </div>
      )}
    </div>
  );
}