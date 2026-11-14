import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Owns the request lifecycle for /api/itinerary.
 *
 * The requirement this exists for: "don't let a stale response overwrite a
 * newer one". Two mechanisms, because they solve different halves:
 *
 *  - `requestId` is a monotonic counter. Every response checks its own id
 *    against the latest before touching state. This is the one that actually
 *    guarantees correctness: a response that resolved from cache, or raced
 *    past an abort, still cannot write.
 *  - `AbortController` cancels the in-flight HTTP request so we stop waiting
 *    on work nobody wants. This is an optimisation, not the guarantee —
 *    abort is advisory and a request can already be past the point of no
 *    return when it fires.
 *
 * Client-side failures use their own codes (FETCH_FAILED, TIMEOUT,
 * BAD_RESPONSE) so they never collide with the server's taxonomy.
 */

const TIMEOUT_MS = 30_000;

const CLIENT_ERRORS = {
  FETCH_FAILED: {
    code: 'FETCH_FAILED',
    message: "Couldn't reach the server. Check that the dev server is running.",
    retryable: true,
  },
  TIMEOUT: {
    code: 'TIMEOUT',
    message: 'The request took too long and was cancelled.',
    retryable: true,
  },
  BAD_RESPONSE: {
    code: 'BAD_RESPONSE',
    message: 'The server sent something that was not valid JSON.',
    retryable: true,
  },
};

export function useItinerary() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [itinerary, setItinerary] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  // Kept so Retry replays the same request rather than whatever is in the
  // textarea now — the user may have edited it while waiting.
  const lastRequest = useRef(null);

  const requestId = useRef(0);
  const inFlight = useRef(null);

  // Abort on unmount so a pending request can't resolve into a dead component.
  useEffect(() => () => inFlight.current?.abort(), []);

  const generate = useCallback(async ({ prompt, chaos }) => {
    const id = ++requestId.current;

    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, TIMEOUT_MS);

    lastRequest.current = { prompt, chaos };
    setStatus('loading');
    setError(null);

    try {
      const res = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({ prompt, ...(chaos ? { chaos } : {}) }),
      });

      // Everything past this point is guarded: a superseded request returns
      // without writing a single piece of state.
      if (id !== requestId.current) return;

      let json = null;
      try {
        json = await res.json();
      } catch {
        if (id !== requestId.current) return;
        setError(CLIENT_ERRORS.BAD_RESPONSE);
        setStatus('error');
        return;
      }

      if (id !== requestId.current) return;

      if (!res.ok || json?.error) {
        setError({
          code: json?.error?.code ?? 'UNKNOWN',
          message: json?.error?.message ?? `Request failed (${res.status}).`,
          retryable: json?.error?.retryable ?? true,
          detail: json?.error?.detail,
          issues: json?.error?.issues,
        });
        setStatus('error');
        return;
      }

      if (!json?.itinerary?.days?.length) {
        setError({
          code: 'EMPTY',
          message: 'The model returned no days to show.',
          retryable: true,
        });
        setStatus('error');
        return;
      }

      setItinerary(json.itinerary);
      setMeta(json.meta ?? null);
      setStatus('success');
    } catch (err) {
      if (id !== requestId.current) return;

      // An abort we caused by superseding is handled by the id guard above.
      // Reaching here with an AbortError means our own timeout fired.
      if (err?.name === 'AbortError') {
        if (!timedOut) return;
        setError(CLIENT_ERRORS.TIMEOUT);
      } else {
        setError({ ...CLIENT_ERRORS.FETCH_FAILED, detail: err?.message });
      }
      setStatus('error');
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRequest.current) generate(lastRequest.current);
  }, [generate]);

  const reset = useCallback(() => {
    requestId.current += 1; // orphan anything in flight
    inFlight.current?.abort();
    lastRequest.current = null;
    setStatus('idle');
    setItinerary(null);
    setMeta(null);
    setError(null);
  }, []);

  return { status, itinerary, meta, error, generate, retry, reset };
}