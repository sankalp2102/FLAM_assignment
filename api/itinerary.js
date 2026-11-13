/**
 * POST /api/itinerary
 *
 * The only place the Gemini key exists. The browser never sees it.
 *
 * Responsibilities, in order:
 *   1. Validate the incoming prompt.
 *   2. Call Gemini with a responseSchema so JSON is enforced provider-side.
 *   3. Run the parse ladder (fenced markdown -> brace slice -> JSON.parse).
 *   4. Validate with zod. If it fails, ONE repair round-trip that hands the
 *      model its own output plus the exact validation errors.
 *   5. Return a typed error code on failure so the client can show the right
 *      copy instead of a generic "something went wrong".
 */

import { geminiResponseSchema, parseItinerary } from '../shared/schema.js';

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const UPSTREAM_TIMEOUT_MS = 22_000;
const MAX_PROMPT_CHARS = 2000;

const SYSTEM_INSTRUCTION = `You are a travel planner that outputs ONLY structured itinerary data.

Rules:
- Return 3 to 6 stops per day, ordered morning -> afternoon -> evening.
- durationMins is realistic travel-and-visit time for that single stop.
- description is one or two sentences, concrete and specific to the place. No filler.
- Mark genuinely skippable stops with optional: true.
- If the user gives a trip length, honour it exactly. If not, infer a sensible one and set durationDays to match the number of days you return.
- If the request is not a trip at all (gibberish, or an unrelated question), return a single day whose title explains you could not plan it and one stop named "Could not plan this trip".
- Never include commentary, markdown, or prose outside the JSON object.`;

/* -------------------------------------------------------------------------- */
/* Parse ladder                                                               */
/* -------------------------------------------------------------------------- */

/** Pull a JSON object out of text that may be fenced, prefixed, or trailing. */
export function extractJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'empty' };

  const attempts = [];
  const trimmed = text.trim();
  attempts.push(trimmed);

  // 1. ```json ... ``` fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // 2. Widest brace slice — survives leading apologies and trailing notes.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return { ok: true, value: parsed };
    } catch {
      /* try the next rung */
    }
  }

  return { ok: false, reason: 'unparseable' };
}

/* -------------------------------------------------------------------------- */
/* Gemini                                                                     */
/* -------------------------------------------------------------------------- */

async function callGemini({ apiKey, userParts, signal }) {
  const res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`gemini ${res.status}: ${body.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();

  if (json?.promptFeedback?.blockReason) {
    const err = new Error(`blocked: ${json.promptFeedback.blockReason}`);
    err.code = 'BLOCKED';
    throw err;
  }

  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

  return { text, finishReason: candidate?.finishReason ?? null };
}

/* -------------------------------------------------------------------------- */
/* Chaos modes — demoable failure paths                                       */
/* -------------------------------------------------------------------------- */

const CHAOS = {
  truncated: () => ({ text: '{"trip":{"title":"Lisbon in 3 days","destination":"Lisbon","durationDays":3,"summ' }),
  wrong_shape: () => ({ text: JSON.stringify({ trip: 'Lisbon', days: 'three' }) }),
  partial: () => ({
    text: JSON.stringify({
      trip: { title: 'Lisbon in 2 days', destination: 'Lisbon', durationDays: 2, summary: 'Short hop.' },
      days: [
        {
          dayNumber: 1,
          title: 'Alfama and the waterfront',
          stops: [
            { name: 'Miradouro das Portas do Sol', category: 'sight', timeOfDay: 'morning', durationMins: 45, description: 'Tiled terrace looking over Alfama rooftops to the river.' },
            { name: null, category: 'food', timeOfDay: 'afternoon', durationMins: 60, description: 'Broken stop — should be dropped, not fatal.' },
          ],
        },
        { dayNumber: 2, title: 'Belem', stops: [] },
      ],
    }),
  }),
  empty: () => ({ text: '' }),
  prose: () => ({ text: "I'd love to help plan your trip! Here are some ideas you might enjoy." }),
};

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ error: { code, message, ...extra } });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(res, 500, 'CONFIG', 'GEMINI_API_KEY is not set on the server.');
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) return fail(res, 400, 'BAD_REQUEST', 'Describe your trip to get started.');
  if (prompt.length > MAX_PROMPT_CHARS) {
    return fail(res, 400, 'BAD_REQUEST', `Keep it under ${MAX_PROMPT_CHARS} characters.`);
  }

  const chaosAllowed = process.env.ALLOW_CHAOS === '1' || process.env.VERCEL_ENV !== 'production';
  const chaos = chaosAllowed && typeof body?.chaos === 'string' ? body.chaos : null;

  if (chaos === 'server_error') return fail(res, 500, 'UPSTREAM', 'Simulated upstream failure.');
  if (chaos === 'slow') await new Promise((r) => setTimeout(r, 60_000));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    let first;
    if (chaos && CHAOS[chaos]) {
      first = CHAOS[chaos]();
    } else {
      first = await callGemini({
        apiKey,
        userParts: [{ text: prompt }],
        signal: controller.signal,
      });
    }

    let attempt = evaluate(first);

    // --- one repair round-trip ------------------------------------------------
    // The model gets its own broken output plus the exact validation errors.
    // One shot only: a loop here would burn the user's time and our quota.
    let repaired = false;
    if (!attempt.ok && !chaos) {
      repaired = true;
      const second = await callGemini({
        apiKey,
        userParts: [
          { text: prompt },
          {
            text: [
              'Your previous response was rejected by schema validation.',
              '',
              'Previous response:',
              (first.text ?? '').slice(0, 4000) || '(empty)',
              '',
              'Validation errors:',
              ...attempt.issues.slice(0, 12).map((i) => `- ${i}`),
              '',
              'Return a corrected JSON object that satisfies the schema exactly. Output JSON only.',
            ].join('\n'),
          },
        ],
        signal: controller.signal,
      });
      attempt = evaluate(second);
    }

    if (!attempt.ok) {
      return fail(res, 502, attempt.code, attempt.message, {
        issues: attempt.issues.slice(0, 12),
        repaired,
      });
    }

    return res.status(200).json({
      itinerary: attempt.data,
      meta: {
        model: MODEL,
        repaired,
        // Non-fatal casualties: stops or days we dropped to keep the rest renderable.
        droppedIssues: attempt.issues.slice(0, 12),
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return fail(res, 504, 'TIMEOUT', 'The model took too long. Try again.');
    }
    if (err.code === 'BLOCKED') {
      return fail(res, 422, 'BLOCKED', 'That prompt was blocked by the safety filter.');
    }
    if (err.status === 429) {
      return fail(res, 429, 'RATE_LIMIT', 'Rate limit hit. Wait a moment and retry.');
    }
    if (err.status >= 500 || err.status === 503) {
      return fail(res, 502, 'UPSTREAM', 'The model service is unavailable. Try again.');
    }
    console.error('[itinerary] unexpected', err);
    return fail(res, 500, 'UNKNOWN', 'Something went wrong generating the itinerary.');
  } finally {
    clearTimeout(timer);
  }
}

/** Run the ladder + zod on one model response and classify the outcome. */
function evaluate({ text, finishReason }) {
  if (finishReason === 'MAX_TOKENS') {
    return {
      ok: false,
      code: 'UNPARSEABLE',
      message: 'The model ran out of room mid-answer.',
      issues: ['response truncated at max output tokens'],
    };
  }

  const extracted = extractJson(text);
  if (!extracted.ok) {
    return extracted.reason === 'empty'
      ? { ok: false, code: 'EMPTY', message: 'The model returned nothing.', issues: ['empty response body'] }
      : {
          ok: false,
          code: 'UNPARSEABLE',
          message: "The model's response was not valid JSON.",
          issues: [`could not parse ${String(text).length} chars as JSON`],
        };
  }

  const parsed = parseItinerary(extracted.value);
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'BAD_SHAPE',
      message: "The model's response did not match the expected shape.",
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data, issues: parsed.issues };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
