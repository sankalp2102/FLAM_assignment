import { theme } from '../theme.js';

const CHAOS_MODES = ['', 'truncated', 'wrong_shape', 'partial', 'empty', 'prose', 'server_error', 'slow'];

export default function PromptForm({ value, onChange, chaos, onChaosChange, onSubmit, busy, showChaos }) {
  const disabled = busy || !value.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit();
      }}
      style={{ display: 'grid', gap: theme.space(3) }}
    >
      <label htmlFor="trip-prompt" style={{ fontSize: 13, color: theme.color.textDim }}>
        Describe your trip
      </label>
      <textarea
        id="trip-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="4 days in Kyoto in autumn, temples and coffee, slow mornings…"
        // Cmd/Ctrl+Enter submits — the textarea needs plain Enter for newlines.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !disabled) onSubmit();
        }}
        style={{
          width: '100%',
          padding: theme.space(3),
          background: theme.color.surface,
          color: theme.color.text,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          resize: 'vertical',
          fontSize: 15, // 16px-ish stops iOS Safari zooming on focus
          lineHeight: 1.5,
        }}
      />

      <div style={{ display: 'flex', gap: theme.space(3), alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={disabled}
          style={{
            minHeight: theme.tap,
            padding: `0 ${theme.space(5)}`,
            background: theme.color.accent,
            color: theme.color.bg,
            border: 'none',
            borderRadius: theme.radius.md,
            fontWeight: 600,
            fontSize: 15,
            opacity: disabled ? 0.45 : 1,
          }}
        >
          {busy ? 'Generating…' : 'Plan the trip'}
        </button>

        <span style={{ fontSize: 12, color: theme.color.textDim }}>
          {value.length}/2000
        </span>

        {showChaos && (
          <label style={{ marginLeft: 'auto', fontSize: 12, color: theme.color.textDim, display: 'flex', gap: theme.space(2), alignItems: 'center' }}>
            Chaos
            <select
              value={chaos}
              onChange={(e) => onChaosChange(e.target.value)}
              style={{
                minHeight: 32,
                background: theme.color.surfaceAlt,
                color: theme.color.text,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.sm,
                padding: `0 ${theme.space(2)}`,
                fontSize: 12,
              }}
            >
              {CHAOS_MODES.map((m) => (
                <option key={m || 'off'} value={m}>
                  {m || 'off'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </form>
  );
}