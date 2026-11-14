import { theme } from '../../theme.js';

/**
 * One error component, driven by the server's typed code and `retryable` flag.
 *
 * The flag is the point: retrying a rejected API key or a wrong model id just
 * reproduces the failure, so those get a "what to fix" hint and no Retry
 * button. Offering a button that cannot work is a worse error message.
 */

const HINTS = {
  CONFIG: 'GROQ_API_KEY is missing from .env on the server. Add it and restart.',
  UPSTREAM_AUTH: 'The key was rejected. Check GROQ_API_KEY, then restart the server.',
  UPSTREAM_MODEL: 'That model id is not available to your key. Set GROQ_MODEL in .env.',
  UPSTREAM_REQUEST: 'The provider rejected the request shape — see the detail below.',
  RATE_LIMIT: 'You have hit the free-tier limit. Waiting a minute usually clears it.',
  BLOCKED: 'Try rephrasing the trip description.',
  BAD_REQUEST: 'Describe the trip in a bit more detail.',
  UNPARSEABLE: "The model did not return usable JSON, twice. Retrying often works — it's a different sample.",
  BAD_SHAPE: 'The model returned JSON in the wrong shape, twice. Retrying often works.',
  EMPTY: 'The model returned nothing. Retrying often works.',
  FETCH_FAILED: 'Is the dev server still running?',
};

export default function ErrorState({ error, onRetry, onReset }) {
  const hint = HINTS[error.code];

  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${theme.color.danger}55`,
        background: `${theme.color.danger}0f`,
        borderRadius: theme.radius.lg,
        padding: theme.space(5),
        display: 'grid',
        gap: theme.space(3),
      }}
    >
      <div style={{ display: 'flex', gap: theme.space(3), alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>{error.message}</strong>
        <code
          style={{
            fontFamily: theme.font.mono,
            fontSize: 11,
            color: theme.color.textDim,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.sm,
            padding: '2px 6px',
          }}
        >
          {error.code}
        </code>
      </div>

      {hint && <p style={{ margin: 0, color: theme.color.textDim, fontSize: 14 }}>{hint}</p>}

      {error.issues?.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', color: theme.color.textDim, fontSize: 13 }}>
            Validation errors ({error.issues.length})
          </summary>
          <ul style={{ margin: `${theme.space(2)} 0 0`, paddingLeft: theme.space(5), fontSize: 12, fontFamily: theme.font.mono, color: theme.color.textDim }}>
            {error.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
      )}

      {error.detail && (
        <details>
          <summary style={{ cursor: 'pointer', color: theme.color.textDim, fontSize: 13 }}>
            Provider detail
          </summary>
          <pre style={{ margin: `${theme.space(2)} 0 0`, fontSize: 11, fontFamily: theme.font.mono, color: theme.color.textDim, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error.detail}
          </pre>
        </details>
      )}

      <div style={{ display: 'flex', gap: theme.space(2), flexWrap: 'wrap' }}>
        {error.retryable && (
          <button type="button" onClick={onRetry} style={primary}>
            Try again
          </button>
        )}
        <button type="button" onClick={onReset} style={ghost}>
          Start over
        </button>
      </div>
    </div>
  );
}

const primary = {
  minHeight: theme.tap,
  padding: `0 ${theme.space(5)}`,
  background: theme.color.accent,
  color: theme.color.bg,
  border: 'none',
  borderRadius: theme.radius.md,
  fontWeight: 600,
};

const ghost = {
  minHeight: theme.tap,
  padding: `0 ${theme.space(4)}`,
  background: 'transparent',
  color: theme.color.textDim,
  border: `1px solid ${theme.color.border}`,
  borderRadius: theme.radius.md,
};