/**
 * All itinerary mutations. A pure function, so the interactions the assignment
 * asks for (expand, remove, reorder) are testable without React and trivial to
 * reason about under questioning.
 *
 * Note what is NOT here: loading and error state. That lives in useItinerary.
 * Mixing request lifecycle into document state is how reducers turn into mud.
 */

export const initialState = {
  itinerary: null,
  collapsed: {}, // dayId -> bool
  lastRemoved: null, // { dayId, index, stop } for undo
};

/** Replace a day's stops, leaving everything else alone. */
const withStops = (state, dayId, fn) => ({
  ...state,
  itinerary: {
    ...state.itinerary,
    days: state.itinerary.days.map((d) => (d.id === dayId ? { ...d, stops: fn(d.stops) } : d)),
  },
});

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_ITINERARY': {
      const { itinerary } = action;
      // Day 1 open, the rest collapsed: a 5-day trip is unreadable fully
      // expanded on a phone.
      const collapsed = {};
      itinerary.days.forEach((d, i) => {
        collapsed[d.id] = i !== 0;
      });
      return { itinerary, collapsed, lastRemoved: null };
    }

    case 'CLEAR':
      return initialState;

    case 'TOGGLE_DAY':
      return {
        ...state,
        collapsed: { ...state.collapsed, [action.dayId]: !state.collapsed[action.dayId] },
      };

    case 'SET_ALL_COLLAPSED': {
      const collapsed = {};
      state.itinerary.days.forEach((d) => {
        collapsed[d.id] = action.value;
      });
      return { ...state, collapsed };
    }

    case 'REMOVE_STOP': {
      const day = state.itinerary.days.find((d) => d.id === action.dayId);
      if (!day) return state;
      const index = day.stops.findIndex((s) => s.id === action.stopId);
      if (index === -1) return state;

      return {
        ...withStops(state, action.dayId, (stops) => stops.filter((s) => s.id !== action.stopId)),
        // Remembering position, not just the stop, so undo restores order
        // rather than appending to the end.
        lastRemoved: { dayId: action.dayId, index, stop: day.stops[index] },
      };
    }

    case 'UNDO_REMOVE': {
      if (!state.lastRemoved) return state;
      const { dayId, index, stop } = state.lastRemoved;
      return {
        ...withStops(state, dayId, (stops) => {
          const next = [...stops];
          next.splice(Math.min(index, next.length), 0, stop);
          return next;
        }),
        lastRemoved: null,
      };
    }

    case 'DISMISS_UNDO':
      return { ...state, lastRemoved: null };

    case 'MOVE_STOP': {
      const { dayId, stopId, direction } = action;
      const day = state.itinerary.days.find((d) => d.id === dayId);
      if (!day) return state;
      const from = day.stops.findIndex((s) => s.id === stopId);
      const to = from + (direction === 'up' ? -1 : 1);
      if (from === -1 || to < 0 || to >= day.stops.length) return state;

      return withStops(state, dayId, (stops) => {
        const next = [...stops];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      });
    }

    default:
      return state;
  }
}

/** Derived display values. Kept out of state so they cannot go stale. */
export const dayTotals = (day) => {
  const mins = day.stops.reduce((sum, s) => sum + (s.durationMins || 0), 0);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    stopCount: day.stops.length,
    label: h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`,
  };
};