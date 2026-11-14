#!/usr/bin/env python3
"""Switch the itinerary endpoint from Gemini to Groq.

Google's AQ.-prefixed keys authenticate for ListModels but return 404 on
generateContent, which is not fixable client-side. Everything downstream of the
HTTP call is provider-independent, so only the call itself and the JSON Schema
dialect change.

Idempotent: re-running reports 'skip' on anything already applied.
"""
import sys

def patch(path, edits):
    s = open(path, encoding='utf-8').read()
    print(f'{path}:')
    for old, new, label in edits:
        if new in s:
            print(f'  skip  {label}')
            continue
        if old not in s:
            sys.exit(f'FAILED on "{label}" in {path}. Nothing written to any file.')
        s = s.replace(old, new, 1)
        print(f'  ok    {label}')
    return s

# ---------------------------------------------------------------- schema.js --
SCHEMA_OLD_HEADER = """/* -------------------------------------------------------------------------- */
/* Gemini responseSchema (OpenAPI subset — no additionalProperties, no $ref)   */
/* -------------------------------------------------------------------------- */

export const geminiResponseSchema = {
  type: 'object',
  properties: {
    trip: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        destination: { type: 'string' },
        durationDays: { type: 'integer' },
        summary: { type: 'string' },
      },
      required: ['title', 'destination', 'durationDays', 'summary'],
      propertyOrdering: ['title', 'destination', 'durationDays', 'summary'],
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dayNumber: { type: 'integer' },
          title: { type: 'string' },
          stops: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                category: { type: 'string', enum: CATEGORIES },
                timeOfDay: { type: 'string', enum: TIMES_OF_DAY },
                durationMins: { type: 'integer' },
                description: { type: 'string' },
                optional: { type: 'boolean' },
              },
              required: ['name', 'category', 'timeOfDay', 'durationMins', 'description'],
              propertyOrdering: [
                'name',
                'category',
                'timeOfDay',
                'durationMins',
                'description',
                'optional',
              ],
            },
          },
        },
        required: ['dayNumber', 'title', 'stops'],
        propertyOrdering: ['dayNumber', 'title', 'stops'],
      },
    },
  },
  required: ['trip', 'days'],
  propertyOrdering: ['trip', 'days'],
};"""

SCHEMA_NEW_HEADER = """/* -------------------------------------------------------------------------- */
/* JSON Schema sent to the provider (OpenAI dialect, strict-compatible).      */
/*                                                                            */
/* Strict mode requires additionalProperties: false on every object and every  */
/* property listed in `required` — including `optional`, which the model must  */
/* therefore always emit. Zod still coerces it, so an absent value is safe.    */
/* -------------------------------------------------------------------------- */

const str = { type: 'string' };
const int = { type: 'integer' };

export const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['trip', 'days'],
  properties: {
    trip: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'destination', 'durationDays', 'summary'],
      properties: { title: str, destination: str, durationDays: int, summary: str },
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayNumber', 'title', 'stops'],
        properties: {
          dayNumber: int,
          title: str,
          stops: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'category', 'timeOfDay', 'durationMins', 'description', 'optional'],
              properties: {
                name: str,
                category: { type: 'string', enum: CATEGORIES },
                timeOfDay: { type: 'string', enum: TIMES_OF_DAY },
                durationMins: int,
                description: str,
                optional: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};"""

schema = patch('shared/schema.js', [(SCHEMA_OLD_HEADER, SCHEMA_NEW_HEADER, 'json schema dialect')])

# ------------------------------------------------------------- itinerary.js --
IT = 'api/itinerary.js'

OLD_DOC = """ * The only place the Gemini key exists. The browser never sees it.
 *
 * Responsibilities, in order:
 *   1. Validate the incoming prompt.
 *   2. Call Gemini with a responseSchema so JSON is enforced provider-side."""
NEW_DOC = """ * The only place the model API key exists. The browser never sees it.
 *
 * Provider is Groq. Google's AQ.-prefixed keys authenticate for ListModels but
 * return 404 on generateContent, so Gemini was unusable; the Gemini
 * implementation is in git history if that is ever fixed. Only this file's HTTP
 * call and the schema dialect were provider-specific.
 *
 * Responsibilities, in order:
 *   1. Validate the incoming prompt.
 *   2. Call the provider with a JSON Schema so shape is enforced upstream."""

OLD_IMPORT = "import { geminiResponseSchema, parseItinerary } from '../shared/schema.js';"
NEW_IMPORT = "import { jsonSchema, parseItinerary } from '../shared/schema.js';"

OLD_CONST = """// Overridable without a code change: Google retires model ids on a schedule,
// so `GEMINI_MODEL=... ` in .env or Vercel beats editing source.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;"""
NEW_CONST = """// Overridable without a code change: providers retire model ids on a schedule,
// so `GROQ_MODEL=...` in .env or Vercel beats editing source.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';"""

OLD_SECTION = """/* -------------------------------------------------------------------------- */
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
}"""

NEW_SECTION = """/* -------------------------------------------------------------------------- */
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
      content: `Return JSON matching this JSON Schema exactly:\\n${JSON.stringify(jsonSchema)}`,
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
}"""

OLD_KEY = """  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(res, 500, 'CONFIG', 'GEMINI_API_KEY is not set on the server.');
  }"""
NEW_KEY = """  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return fail(res, 500, 'CONFIG', 'GROQ_API_KEY is not set on the server.');
  }"""

OLD_CALL1 = """      first = await callGemini({
        apiKey,
        userParts: [{ text: prompt }],
        signal: controller.signal,
      });"""
NEW_CALL1 = """      first = await callModel({
        apiKey,
        messages: [{ role: 'user', content: prompt }],
        signal: controller.signal,
      });"""

OLD_CALL2 = """      const second = await callGemini({
        apiKey,
        userParts: [
          { text: prompt },
          {
            text: ["""
NEW_CALL2 = """      const second = await callModel({
        apiKey,
        messages: [
          { role: 'user', content: prompt },
          {
            role: 'user',
            content: ["""

OLD_AUTH = "'The model service rejected the key. Check GEMINI_API_KEY on the server.'"
NEW_AUTH = "'The model service rejected the key. Check GROQ_API_KEY on the server.'"

OLD_MODELMSG = '`Model "${MODEL}" was not found for this API key. List what your key can use, then set GEMINI_MODEL in .env.`'
NEW_MODELMSG = '`Model "${MODEL}" was not found for this API key. List what your key can use, then set GROQ_MODEL in .env.`'

OLD_FINISH = """  if (finishReason === 'MAX_TOKENS') {"""
NEW_FINISH = """  if (finishReason === 'length') {"""

itinerary = patch(IT, [
    (OLD_DOC, NEW_DOC, 'module docstring'),
    (OLD_IMPORT, NEW_IMPORT, 'schema import'),
    (OLD_CONST, NEW_CONST, 'endpoint + model'),
    (OLD_SECTION, NEW_SECTION, 'provider call'),
    (OLD_KEY, NEW_KEY, 'api key env var'),
    (OLD_CALL1, NEW_CALL1, 'first call site'),
    (OLD_CALL2, NEW_CALL2, 'repair call site'),
    (OLD_AUTH, NEW_AUTH, 'auth error message'),
    (OLD_MODELMSG, NEW_MODELMSG, 'model error message'),
    (OLD_FINISH, NEW_FINISH, 'truncation finish_reason'),
])

# ------------------------------------------------------------------ .env.example
ENV_NEW = """# Groq -> https://console.groq.com/keys
# Server-side only. Never prefix with VITE_ (that would expose it to the browser).
GROQ_API_KEY=your_key_here

# Optional: override the model id without editing source.
# List what your key supports with:
#   curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" | grep '"id"'
# GROQ_MODEL=llama-3.3-70b-versatile
"""

open('shared/schema.js', 'w', encoding='utf-8').write(schema)
open(IT, 'w', encoding='utf-8').write(itinerary)
open('.env.example', 'w', encoding='utf-8').write(ENV_NEW)
print('.env.example: rewritten for Groq')
print('\nDone. Put GROQ_API_KEY in .env and restart the dev server.')
