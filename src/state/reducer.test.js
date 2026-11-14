import { reducer, initialState, dayTotals } from './reducer.js';

const mk = () => ({
  trip: { title: 'T', destination: 'D', durationDays: 2, summary: '' },
  days: [
    { id: 'd1', dayNumber: 1, title: 'Day one', stops: [
      { id: 's1', name: 'A', category: 'food', timeOfDay: 'morning', durationMins: 60, description: '', optional: false },
      { id: 's2', name: 'B', category: 'sight', timeOfDay: 'afternoon', durationMins: 90, description: '', optional: false },
      { id: 's3', name: 'C', category: 'rest', timeOfDay: 'evening', durationMins: 30, description: '', optional: true },
    ]},
    { id: 'd2', dayNumber: 2, title: 'Day two', stops: [
      { id: 's4', name: 'X', category: 'food', timeOfDay: 'morning', durationMins: 45, description: '', optional: false },
    ]},
  ],
});

let pass = 0, fail = 0;
const t = (name, cond) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const names = (s, d) => s.itinerary.days.find(x => x.id === d).stops.map(x => x.name).join(',');

// --- SET_ITINERARY
let s = reducer(initialState, { type: 'SET_ITINERARY', itinerary: mk() });
t('day 1 open, rest collapsed', s.collapsed.d1 === false && s.collapsed.d2 === true);
t('itinerary stored', s.itinerary.days.length === 2);

// --- TOGGLE_DAY
let s2 = reducer(s, { type: 'TOGGLE_DAY', dayId: 'd2' });
t('toggle opens d2', s2.collapsed.d2 === false);
t('toggle leaves d1 alone', s2.collapsed.d1 === false);

// --- SET_ALL_COLLAPSED
let s3 = reducer(s, { type: 'SET_ALL_COLLAPSED', value: true });
t('collapse all', s3.collapsed.d1 === true && s3.collapsed.d2 === true);

// --- MOVE_STOP
let m = reducer(s, { type: 'MOVE_STOP', dayId: 'd1', stopId: 's2', direction: 'up' });
t('move up swaps', names(m,'d1') === 'B,A,C');
m = reducer(s, { type: 'MOVE_STOP', dayId: 'd1', stopId: 's2', direction: 'down' });
t('move down swaps', names(m,'d1') === 'A,C,B');
t('move up at index 0 is a no-op', reducer(s, { type:'MOVE_STOP', dayId:'d1', stopId:'s1', direction:'up' }) === s);
t('move down at last is a no-op', reducer(s, { type:'MOVE_STOP', dayId:'d1', stopId:'s3', direction:'down' }) === s);
t('move in other day untouched', names(reducer(s,{type:'MOVE_STOP',dayId:'d1',stopId:'s2',direction:'up'}),'d2') === 'X');
t('unknown day is a no-op', reducer(s, { type:'MOVE_STOP', dayId:'nope', stopId:'s1', direction:'up' }) === s);

// --- REMOVE_STOP + UNDO restores POSITION not append
let r = reducer(s, { type: 'REMOVE_STOP', dayId: 'd1', stopId: 's2' });
t('remove drops the stop', names(r,'d1') === 'A,C');
t('remove records position', r.lastRemoved.index === 1 && r.lastRemoved.stop.id === 's2');
let u = reducer(r, { type: 'UNDO_REMOVE' });
t('undo restores at original index', names(u,'d1') === 'A,B,C');
t('undo clears lastRemoved', u.lastRemoved === null);

// undo after removing the LAST stop
let rLast = reducer(s, { type: 'REMOVE_STOP', dayId: 'd1', stopId: 's3' });
t('undo restores tail position', names(reducer(rLast, { type:'UNDO_REMOVE' }),'d1') === 'A,B,C');

// undo after removing first
let rFirst = reducer(s, { type: 'REMOVE_STOP', dayId: 'd1', stopId: 's1' });
t('undo restores head position', names(reducer(rFirst, { type:'UNDO_REMOVE' }),'d1') === 'A,B,C');

// emptying a day
let e = reducer(reducer(reducer(s,{type:'REMOVE_STOP',dayId:'d2',stopId:'s4'}),{type:'DISMISS_UNDO'}),{type:'NOOP'});
t('day can go empty without crashing', e.itinerary.days.find(d=>d.id==='d2').stops.length === 0);
t('dismiss clears undo', e.lastRemoved === null);
t('undo with nothing removed is a no-op', reducer(e, { type:'UNDO_REMOVE' }) === e);

// --- immutability: original object never mutated
const orig = mk();
const base = reducer(initialState, { type: 'SET_ITINERARY', itinerary: orig });
reducer(base, { type: 'MOVE_STOP', dayId: 'd1', stopId: 's2', direction: 'up' });
reducer(base, { type: 'REMOVE_STOP', dayId: 'd1', stopId: 's1' });
t('input itinerary not mutated', orig.days[0].stops.map(x=>x.name).join(',') === 'A,B,C');
t('other days keep identity (no needless rerender)',
   reducer(base,{type:'MOVE_STOP',dayId:'d1',stopId:'s2',direction:'up'}).itinerary.days[1] === base.itinerary.days[1]);

// --- CLEAR
t('clear resets', reducer(base, { type:'CLEAR' }).itinerary === null);

// --- dayTotals
t('totals sum and format', dayTotals(mk().days[0]).label === '3h' && dayTotals(mk().days[0]).stopCount === 3);
t('totals under an hour', dayTotals(mk().days[1]).label === '45m');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);