/**
 * STEP 1 HARNESS.
 *
 * This is deliberately the smallest thing that proves the whole pipeline:
 * textarea -> /api/itinerary -> Gemini -> parse ladder -> zod -> renderable JSON.
 *
 * It is NOT the final UI. The naive fetch below gets replaced by
 * hooks/useItinerary.js (AbortController + request-id race guard) in the next
 * commit, and the <pre> dump gets replaced by the day/stop components.
 * Kept as its own commit so the pipeline is verified before any UI exists.
 */

import { useState } from 'react';
import { theme } from './theme.js';

const CHAOS_MODES = ['', 'truncated', 'wrong_shape', 'partial', 'empty', 'prose', 'server_error'];

export default function App() {
  const [prompt, setPrompt] = useState('5 relaxed days in Lisbon in March, into food and tiles, no early starts');
  const [chaos, setChaos] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(chaos ? { chaos } : {}) }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? { code: 'UNKNOWN', message: 'Request failed.' });
        setStatus('error');
        return;
      }

      setResult(json);
      setStatus('success');
    } catch (err) {
      setError({ code: 'NETWORK', message: err.message });
      setStatus('error');
    }
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: theme.space(5) }}>
      <h1 style={{ fontSize: 22, margin: `0 0 ${theme.space(1)}` }}>
        Trip Planner <span style={{ color: theme.color.textDim, fontWeight: 400 }}>— pipeline harness</span>
      </h1>
      <p style={{ color: theme.color.textDim, marginTop: 0, fontSize: 14 }}>
        Step 1: proving the serverless call, parse ladder and schema validation before any real UI.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: theme.space(3), marginTop: theme.space(5) }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe your trip…"
          style={{
            width: '100%',
            padding: theme.space(3),
            background: theme.color.surface,
            color: theme.color.text,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={status === 'loading' || !prompt.trim()}
            style={{
              minHeight: theme.tap,
              padding: `0 ${theme.space(5)}`,
              background: theme.color.accent,
              color: '#0f1115',
              border: 'none',
              borderRadius: theme.radius.md,
              fontWeight: 600,
              opacity: status === 'loading' || !prompt.trim() ? 0.5 : 1,
            }}
          >
            {status === 'loading' ? 'Generating…' : 'Generate itinerary'}
          </button>

          <label style={{ color: theme.color.textDim, fontSize: 13, display: 'flex', gap: theme.space(2), alignItems: 'center' }}>
            Chaos
            <select
              value={chaos}
              onChange={(e) => setChaos(e.target.value)}
              style={{
                minHeight: theme.tap,
                background: theme.color.surfaceAlt,
                color: theme.color.text,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.sm,
                padding: `0 ${theme.space(2)}`,
              }}
            >
              {CHAOS_MODES.map((m) => (
                <option key={m || 'off'} value={m}>
                  {m || 'off'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <section style={{ marginTop: theme.space(6) }}>
        {status === 'error' && (
          <pre style={dumpStyle(theme.color.danger)}>{JSON.stringify(error, null, 2)}</pre>
        )}
        {status === 'success' && (
          <>
            {result.meta?.droppedIssues?.length > 0 && (
              <pre style={dumpStyle(theme.color.warn)}>
                {`dropped (non-fatal):\n${result.meta.droppedIssues.join('\n')}`}
              </pre>
            )}
            <pre style={dumpStyle(theme.color.border)}>{JSON.stringify(result, null, 2)}</pre>
          </>
        )}
      </section>
    </main>
  );
}

const dumpStyle = (borderColor) => ({
  background: theme.color.surface,
  border: `1px solid ${borderColor}`,
  borderRadius: theme.radius.md,
  padding: theme.space(3),
  fontFamily: theme.font.mono,
  fontSize: 12,
  lineHeight: 1.5,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});
