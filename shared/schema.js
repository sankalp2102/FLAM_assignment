/**
 * Single source of truth for the trip-planner data contract.
 *
 * Imported by BOTH the serverless function (api/itinerary.js) and the client,
 * so the shape can never drift between the two.
 *
 * Design notes worth defending:
 *  - We never ask the model for `id`. Ids are generated locally, because
 *    remove/reorder depend on stable React keys and the model is not a
 *    trustworthy source of identity (it repeats and collides).
 *  - `category` and `timeOfDay` are closed enums, not free text, so icons and
 *    colours are a lookup rather than a guess. Unknown values degrade to a
 *    safe default instead of rejecting the whole response.
 *  - Validation is PER-DAY and PER-STOP, not all-or-nothing. One malformed
 *    stop should cost you that stop, not the entire itinerary.
 */

import { z } from 'zod';

export const CATEGORIES = ['food', 'sight', 'activity', 'transit', 'rest', 'lodging'];
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'];

/* -------------------------------------------------------------------------- */
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
};

/* -------------------------------------------------------------------------- */
/* Zod — runtime truth. Lenient where leniency is harmless, strict elsewhere.  */
/* -------------------------------------------------------------------------- */

const looseEnum = (values, fallback) =>
  z
    .string()
    .transform((v) => String(v).trim().toLowerCase())
    .transform((v) => (values.includes(v) ? v : fallback));

export const stopSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: looseEnum(CATEGORIES, 'activity').catch('activity'),
  timeOfDay: looseEnum(TIMES_OF_DAY, 'morning').catch('morning'),
  durationMins: z.coerce.number().int().min(5).max(24 * 60).catch(60),
  description: z.string().trim().max(600).catch(''),
  optional: z.coerce.boolean().catch(false),
});

export const daySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  stops: z.array(z.unknown()).min(1),
});

export const tripSchema = z.object({
  title: z.string().trim().min(1).max(160),
  destination: z.string().trim().min(1).max(160),
  durationDays: z.coerce.number().int().min(1).max(60).catch(1),
  summary: z.string().trim().max(800).catch(''),
});

/* -------------------------------------------------------------------------- */
/* Ids + normalisation                                                        */
/* -------------------------------------------------------------------------- */

let counter = 0;
export const makeId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/**
 * Validate a raw model object into renderable state.
 *
 * Never throws. Returns:
 *   { ok: true,  data, issues[] }   -> renderable, `issues` may list dropped parts
 *   { ok: false, reason, issues[] } -> unsalvageable; caller decides retry/repair
 */
export function parseItinerary(raw) {
  const issues = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_an_object', issues: ['root: expected an object'] };
  }

  const trip = tripSchema.safeParse(raw.trip);
  if (!trip.success) {
    return {
      ok: false,
      reason: 'bad_trip',
      issues: trip.error.issues.map((i) => `trip.${i.path.join('.')}: ${i.message}`),
    };
  }

  if (!Array.isArray(raw.days) || raw.days.length === 0) {
    return { ok: false, reason: 'no_days', issues: ['days: expected a non-empty array'] };
  }

  const days = [];
  raw.days.forEach((rawDay, dayIdx) => {
    const day = daySchema.safeParse(rawDay);
    if (!day.success) {
      issues.push(`days[${dayIdx}]: dropped (${day.error.issues[0]?.message ?? 'invalid'})`);
      return;
    }

    const stops = [];
    day.data.stops.forEach((rawStop, stopIdx) => {
      const stop = stopSchema.safeParse(rawStop);
      if (!stop.success) {
        issues.push(
          `days[${dayIdx}].stops[${stopIdx}]: dropped (${stop.error.issues[0]?.message ?? 'invalid'})`
        );
        return;
      }
      stops.push({ id: makeId('stop'), ...stop.data });
    });

    if (stops.length === 0) {
      issues.push(`days[${dayIdx}]: dropped (no valid stops)`);
      return;
    }

    days.push({
      id: makeId('day'),
      dayNumber: day.data.dayNumber,
      title: day.data.title,
      stops,
    });
  });

  if (days.length === 0) {
    return { ok: false, reason: 'no_valid_days', issues };
  }

  // Renumber so gaps left by dropped days don't surface as "Day 1, Day 3".
  days.forEach((d, i) => {
    d.dayNumber = i + 1;
  });

  return {
    ok: true,
    data: { trip: trip.data, days },
    issues,
  };
}
