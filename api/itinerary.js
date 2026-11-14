/**
 * POST /api/itinerary
 *
 * The only place the model API key exists. The browser never sees it.
 *
 * Provider is Groq. Google's AQ.-prefixed keys authenticate for ListModels but
 * return 404 on generateContent, so Gemini was unusable; the Gemini
 * implementation is in git history if that is ever fixed. Only this file's HTTP
 * call and the schema dialect were provider-specific.
 *
 * Responsibilities, in order:
 *   1. Validate the incoming prompt.
 *   2. Call the provider with a JSON Schema so shape is enforced upstream.
 *   3. Run the parse ladder (fenced markdown -> brace slice -> JSON.parse).
 *   4. Validate with zod. If it fails, ONE repair round-trip that hands the
 *      model its own output plus the exact validation errors.
 *   5. Return a typed error code on failure so the client can show the right
 *      copy instead of a generic "something went wrong".
 */

import { jsonSchema, parseItinerary } from '../shared/schema.js';

// Overridable without a code change: providers retire model ids on a schedule,
// so `GROQ_MODEL=...` in .env or Vercel beats editing source.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

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
/* Provider call                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One chat completion. `strict` asks for json_schema-constrained output; not
 * every model supports it, so a 400 naming response_format retries once in
 * plain JSON mode with the schema moved into the prompt. Degrading on a
 * provider capability beats failing the user's request over it.
 */
async function callModel({ apiKey, messages, signal, strict = true }) {
  const system = [{ role: 'system', content: SYSTEM_INSTRUCTION }];
  if (!strict) {
    system.push({
      role: 'system',
      content: `Return JSON matching this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`,
    });
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: MODEL,
      messages: [...system, ...messages],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: strict
        ? { type: 'json_schema', json_schema: { name: 'itinerary', strict: true, schema: jsonSchema } }
        : { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 && strict && /response_format|json_schema|schema/i.test(body)) {
      console.warn('[itinerary] json_schema unsupported, retrying in json_object mode');
      return callModel({ apiKey, messages, signal, strict: false });
    }
    const err = new Error(`provider ${res.status}: ${body.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const choice = json?.choices?.[0];

  if (choice?.finish_reason === 'content_filter') {
    const err = new Error('blocked by provider content filter');
    err.code = 'BLOCKED';
    throw err;
  }

  return {
    text: choice?.message?.content ?? '',
    finishReason: choice?.finish_reason ?? null,
  };
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

/**
 * Errors the user can meaningfully retry. The client uses this to decide
 * whether to render a Retry button or a "fix your setup" message — retrying a
 * rejected API key forever is just a worse error message.
 */
const RETRYABLE = new Set([
  'RATE_LIMIT',
  'TIMEOUT',
  'NETWORK',
  'UPSTREAM',
  'EMPTY',
  'UNPARSEABLE',
  'BAD_SHAPE',
  'UNKNOWN',
]);
// UPSTREAM_AUTH, UPSTREAM_MODEL and UPSTREAM_REQUEST are deliberately absent:
// retrying a rejected key or a wrong model id just produces the same failure.

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({
    error: { code, message, retryable: RETRYABLE.has(code), ...extra },
  });

/** Never echo anything key-shaped back to the client, even from an error body. */
const redact = (v) => String(v ?? '').replace(/AIza[0-9A-Za-z_-]{10,}/g, '<redacted>');

/** Transport-level failures: DNS, reset connection, refused, offline. */
function isNetworkError(err) {
  const cause = err?.cause?.code ?? err?.code;
  return (
    (err instanceof TypeError && /fetch failed/i.test(err.message ?? '')) ||
    ['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(
      cause
    )
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fail(res, 500, 'CONFIG', 'GROQ_API_KEY is not set on the server.');
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
      first = await callModel({
        apiKey,
        messages: [{ role: 'user', content: prompt }],
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
      const second = await callModel({
        apiKey,
        messages: [
          { role: 'user', content: prompt },
          {
            role: 'user',
            content: [
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
    if (isNetworkError(err)) {
      console.error('[itinerary] network', err?.cause?.code ?? err.message);
      return fail(res, 503, 'NETWORK', 'Could not reach the model service. Check your connection and retry.');
    }
    if (err.status === 429) {
      return fail(res, 429, 'RATE_LIMIT', 'Rate limit hit. Wait a moment and retry.');
    }
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      const detail = redact(err.message);
      console.error('[itinerary] upstream rejected request', detail);

      // A 400 means either "your key is bad" or "your request is bad", and
      // those need opposite fixes. Guessing wrong sends people hunting for a
      // key problem that isn't there, so disambiguate on the upstream message
      // and surface it.
      const looksLikeAuth =
        err.status !== 400 || /api[\s_-]?key|API_KEY_INVALID|permission|unauthenticated/i.test(detail);

      return looksLikeAuth
        ? fail(res, 500, 'UPSTREAM_AUTH', 'The model service rejected the key. Check GROQ_API_KEY on the server.', { detail })
        : fail(res, 500, 'UPSTREAM_REQUEST', `The model service rejected the request itself — likely the responseSchema or a bad "${MODEL}" parameter.`, { detail });
    }
    if (err.status === 404) {
      return fail(
        res,
        500,
        'UPSTREAM_MODEL',
        `Model "${MODEL}" was not found for this API key. List what your key can use, then set GROQ_MODEL in .env.`
      );
    }
    if (err.status >= 500) {
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
  if (finishReason === 'length') {
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