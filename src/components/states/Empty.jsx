import { theme } from '../../theme.js';

const EXAMPLES = [
  '5 relaxed days in Lisbon in March, into food and tiles, no early starts',
  'Long weekend in Tokyo with a 7-year-old, avoid long queues',
  '3 days in Rajasthan by train, vegetarian, mid-range budget',
];

/**
 * The empty state does work: a blank textarea gives no sense of what a good
 * prompt looks like, and prompt quality is most of the output quality here.
 */
export default function Empty({ onPick }) {
  return (
    <div
      style={{
        border: `1px dashed ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        padding: theme.space(6),
        textAlign: 'center',
        display: 'grid',
        gap: theme.space(4),
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Describe a trip to get an itinerary</div>
        <div style={{ color: theme.color.textDim, fontSize: 14, marginTop: theme.space(1) }}>
          Length, interests and pace all help. Then reorder or drop whatever doesn't fit.
        </div>
      </div>

      <div style={{ display: 'grid', gap: theme.space(2), justifyItems: 'stretch' }}>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            style={{
              minHeight: theme.tap,
              padding: theme.space(3),
              textAlign: 'left',
              background: theme.color.surface,
              color: theme.color.text,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
              fontSize: 14,
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}