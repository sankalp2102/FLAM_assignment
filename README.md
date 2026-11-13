# Trip Planner

A React app that turns a free-form trip description into a structured, interactive
day-by-day itinerary. The model returns JSON against a schema; the app parses,
validates and renders it as stateful components. It is not a chatbot — raw model
text is never displayed.

**Status:** in progress. See [Roadmap](#roadmap).

## Stack

| | |
|---|---|
| Frontend | React 18 (hooks, function components), Vite |
| Styling | Inline styles from a single token file (`src/theme.js`) |
| Model | Google Gemini 2.0 Flash, with provider-enforced `responseSchema` |
| Validation | Zod, shared between server and client (`shared/schema.js`) |
| Backend | One Vercel serverless function (`api/itinerary.js`) |
| Deploy | Vercel |

**The API key never reaches the browser.** It is read from `process.env.GEMINI_API_KEY`
inside the serverless function only, and is deliberately not prefixed `VITE_`
(Vite inlines any `VITE_*` variable into the client bundle).

## Setup

```bash
git clone <repo-url>
cd trip-planner
npm install

cp .env.example .env
# add your key from https://aistudio.google.com/apikey
```

Run it:

```bash
npm i -g vercel     # once
vercel dev          # serves the React app AND the /api function together
```

`npm start` runs Vite alone on :5173 and proxies `/api/*` to :3000, so you can
pair it with `vercel dev` if you prefer two processes.

## How bad model output is handled

Most of the engineering here is in this section, because the model is the
unreliable part of the system.

**1. Provider-enforced JSON.** The request sets `responseMimeType: application/json`
plus a `responseSchema`, so Gemini constrains generation rather than being
politely asked for JSON. This removes the common failure, not the possibility
of failure.

**2. Parse ladder** (`extractJson`, server-side). Three rungs, in order:
`JSON.parse` on the raw text → strip ` ```json ` fences → slice from the first
`{` to the last `}`. The slice survives leading apologies and trailing
commentary. Verified against truncated, fenced, prose-wrapped and empty payloads.

**3. Per-field validation, not all-or-nothing.** Zod validates each day and each
stop independently. A single malformed stop costs you that stop, not the
itinerary — the valid days still render and the dropped parts are reported in
`meta.droppedIssues`. Enums coerce leniently (`"FOOD"` → `food`), numbers coerce
from strings, and days are renumbered so gaps left by dropped days don't surface
as "Day 1, Day 3".

**4. One repair round-trip.** If validation fails, the model is handed its own
output plus the exact Zod error paths and asked for a corrected object. One
attempt only — a loop would burn the user's time and the free-tier quota. The
response reports whether repair was used.

**5. Ids are never trusted to the model.** `id` is not part of the model contract.
Ids are generated locally, because remove and reorder depend on stable React keys
and models collide and repeat identifiers.

**6. Typed error codes.** The function returns one of `CONFIG`, `BAD_REQUEST`,
`RATE_LIMIT`, `TIMEOUT`, `BLOCKED`, `UPSTREAM`, `EMPTY`, `UNPARSEABLE`,
`BAD_SHAPE`, so the UI can show specific copy and the right retry affordance
rather than a generic failure message.

**7. Upstream timeout.** The Gemini call is aborted at 22s and surfaced as a
retryable `TIMEOUT`.

**8. Stale responses cannot overwrite newer ones.** *(next commit)* Every request
carries a monotonic id and an `AbortController`; a late response whose id is not
the current one is dropped before it touches state.

### Chaos modes

Failure paths are demoable rather than merely claimed. The request body accepts
a `chaos` field — `truncated`, `wrong_shape`, `partial`, `empty`, `prose`,
`server_error`, `slow` — which makes the function return that failure without
calling the model. Enabled outside production automatically, or on a deployment
by setting `ALLOW_CHAOS=1`.

## AI usage note

To be completed before submission.

## Known limitations

To be completed before submission.

## Time spent

To be completed before submission.

## Roadmap

- [x] Project scaffold, serverless function, shared schema
- [x] Parse ladder + per-field validation + repair round-trip
- [x] Chaos modes for demoable failure paths
- [ ] `useItinerary` hook — abort + request-id race guard, status machine
- [ ] Reducer: remove / reorder / undo
- [ ] Day and stop components, expand/collapse
- [ ] Loading skeleton, typed error states, empty state
- [ ] Mobile pass
- [ ] README completion + screen recording

Not planned for this build: streaming (it fights the race guard for little
user-visible gain at this scope).
