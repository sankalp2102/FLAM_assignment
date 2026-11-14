import { useReducer, useRef, useState } from 'react';
import { theme } from './theme.js';
import { useItinerary } from './hooks/useItinerary.js';
import { reducer, initialState } from './state/reducer.js';
import PromptForm from './components/PromptForm.jsx';
import ItineraryView from './components/ItineraryView.jsx';
import Loading from './components/states/Loading.jsx';
import ErrorState from './components/states/ErrorState.jsx';
import Empty from './components/states/Empty.jsx';

/**
 * Composition only. Two pieces of state, deliberately separate:
 *
 *  - useItinerary owns the request lifecycle (status, error, race guard).
 *  - the reducer owns the document the user edits.
 *
 * Keeping them apart means editing a stop cannot accidentally resurrect a
 * loading state, and a failed retry cannot wipe edits already made.
 */
export default function App() {
  const [prompt, setPrompt] = useState('');
  const [chaos, setChaos] = useState('');
  const { status, itinerary, meta, error, generate, retry, reset } = useItinerary();
  const [state, dispatch] = useReducer(reducer, initialState);

  // The hook is the source of truth for "what the server returned"; the
  // reducer owns "what the user has done to it since".
  //
  // Adjusted during render rather than in an effect, guarded by a ref. An
  // effect runs after paint, which leaves one frame where status is 'success'
  // but the reducer still holds null — a visible flash of nothing. React
  // sanctions dispatching during render for exactly this "derive state from
  // props" case; the ref makes it run once per new response, not in a loop.
  const applied = useRef(null);
  if (itinerary && applied.current !== itinerary) {
    applied.current = itinerary;
    dispatch({ type: 'SET_ITINERARY', itinerary });
  }

  // Chaos modes are dev-only by default, but ?chaos=1 exposes them on a
  // deployed build so the failure paths can be demoed in a screen recording.
  // The server gates its own side separately via ALLOW_CHAOS.
  const showChaos =
    import.meta.env.DEV ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chaos'));

  const onReset = () => {
    reset();
    applied.current = null;
    dispatch({ type: 'CLEAR' });
  };

  return (
    <div style={{ minHeight: '100%', paddingBottom: theme.space(10) }}>
      <main
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: `${theme.space(6)} ${theme.space(4)}`,
          display: 'grid',
          gap: theme.space(6),
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.01em' }}>Trip Planner</h1>
          <p style={{ margin: `${theme.space(2)} 0 0`, color: theme.color.textDim, fontSize: 14 }}>
            Describe a trip. Get a day-by-day plan you can reshape.
          </p>
        </header>

        <PromptForm
          value={prompt}
          onChange={setPrompt}
          chaos={chaos}
          onChaosChange={setChaos}
          onSubmit={() => generate({ prompt, chaos })}
          busy={status === 'loading'}
          showChaos={showChaos}
        />

        <section aria-live="polite">
          {status === 'idle' && <Empty onPick={setPrompt} />}
          {status === 'loading' && <Loading />}
          {status === 'error' && <ErrorState error={error} onRetry={retry} onReset={onReset} />}
          {status === 'success' && state.itinerary && (
            <ItineraryView state={state} meta={meta} dispatch={dispatch} />
          )}
        </section>
      </main>
    </div>
  );
}