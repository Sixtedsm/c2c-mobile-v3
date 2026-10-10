// What an activity picked from the user's tracker puts into an outing, and
// what comes back once its trace is cleared or replaced.
//
// One tap on a line of OutingTracePicker fills the date, the distance and
// the D+: fields that are published, two of them in « Details », which
// stays folded. The rule that undoes a pick was rewritten five times in
// review, and each version would have published something false in a case
// the next review found. Those cases are the tests below.
//
// Only the rule is played here. Around it the form (OutingEditionView)
// puts the trace on the map between reading a pick and writing it, and
// after a give-back aligns the hidden end date on the first (handleDates)
// and lets the associated routes fill what is still null
// (propagateProperties). No test mounts that.

import { describe, expect, it } from 'vitest';

import { giveBackTracePick, readTracePick, writeTracePick } from '@/pwa/outing-trace-pick';

// A jog tapped by mistake, and a ride whose tracker measured no D+.
const jog = { id: 1, length: 8000.4, heightDiffUp: 149.6 };
const ride = { id: 2, length: 12000 };

const outing = (fields = {}) => ({
  date_start: null,
  date_end: null,
  length_total: null,
  height_diff_up: null,
  ...fields,
});

// A tap on a line of the picker, « Several days? » being `several`.
function tap(doc, activity, day, several = false) {
  const pick = readTracePick(doc, activity, day, several);
  writeTracePick(pick);
  return pick;
}

describe('a pick writes what the tracker measured', () => {
  it('puts in its day, its distance and its D+, in whole metres', () => {
    const doc = outing();
    tap(doc, jog, '2026-10-04');
    expect(doc).toEqual({ date_start: '2026-10-04', date_end: '2026-10-04', length_total: 8000, height_diff_up: 150 });
  });

  it('leaves the D+ alone when the tracker has none', () => {
    // The route's theoretical D+ is still a better figure than none.
    const doc = outing({ height_diff_up: 1200 });
    tap(doc, ride, '2026-10-03');
    expect(doc.length_total).toBe(12000);
    expect(doc.height_diff_up).toBe(1200);
  });
});

describe('a pick whose trace is gone leaves nothing of its own behind', () => {
  it('empties what it had filled in an empty outing', () => {
    // A jog tapped by mistake, cleared, a GPX imported instead: the outing
    // would go out with the jog's 8 km and +150 m.
    const doc = outing();
    const pick = tap(doc, jog, '2026-10-04');
    expect(giveBackTracePick(pick, false)).toBe(false);
    // Empty is null, the only state the routes fill: a route associated
    // since the pick gives its D+ now.
    expect(doc).toEqual(outing());
  });

  it('gives back what the user had typed before the pick', () => {
    // A draft kept at the car with its date and a D+ of 1450 typed in; at
    // home an activity is picked, then replaced by a file. Emptying the
    // field instead would publish the route's theoretical 1200.
    const typed = { date_start: '2026-10-08', date_end: '2026-10-08', height_diff_up: '1450' };
    const doc = outing(typed);
    const pick = tap(doc, jog, '2026-10-04');
    expect(doc.height_diff_up).toBe(150);
    giveBackTracePick(pick, false);
    expect(doc).toEqual(outing(typed));
  });

  it('gives the first pick back before a second one is read', () => {
    // Another line of the picker: the form clears the trace in between.
    // The ride has no D+, so the route's 1200 must show again, not the
    // jog's 150; and clearing the ride must not bring the jog back.
    const doc = outing({ height_diff_up: 1200 });
    giveBackTracePick(tap(doc, jog, '2026-10-04'), false);
    const second = tap(doc, ride, '2026-10-03');
    expect(doc.length_total).toBe(12000);
    expect(doc.height_diff_up).toBe(1200);
    giveBackTracePick(second, false);
    expect(doc).toEqual(outing({ height_diff_up: 1200 }));
  });

  it('keeps a figure corrected since the pick', () => {
    const doc = outing();
    const pick = tap(doc, jog, '2026-10-04');
    doc.length_total = 9500;
    giveBackTracePick(pick, false);
    expect(doc.length_total).toBe(9500);
    expect(doc.height_diff_up).toBeNull();
  });

  it('reads the date before the map dates the outing from the trace', () => {
    // The map dates an undated outing as soon as it gets a trace. Read
    // after that, the pick would give the trace's day back to an outing
    // that had none.
    const doc = outing();
    const pick = readTracePick(doc, jog, '2026-10-04', false);
    doc.date_start = '2026-10-03'; // the map, from the first point of the trace
    writeTracePick(pick);
    giveBackTracePick(pick, false);
    expect(doc.date_start).toBeNull();
  });
});

describe('the date comes back whole, or not at all', () => {
  it('brings several days back with their box ticked', () => {
    // Two days ticked, a pick, « Clear »: the second date would come back
    // hidden, and saving would align it on the first without a word.
    const doc = outing({ date_start: '2026-10-01', date_end: '2026-10-02' });
    const pick = tap(doc, jog, '2026-10-04', true);
    expect(giveBackTracePick(pick, false)).toBe(true);
    expect(doc.date_start).toBe('2026-10-01');
    expect(doc.date_end).toBe('2026-10-02');
  });

  it('does not take two dates that differ for several days', () => {
    // A date typed while the picker loads has no end date yet: it follows
    // on saving. Ticking the box on that difference would show an empty
    // second date, and saving would fail on a field nobody had opened.
    const doc = outing({ date_start: '2026-10-05' });
    const pick = tap(doc, jog, '2026-10-04');
    expect(giveBackTracePick(pick, false)).toBe(false);
    expect(doc.date_start).toBe('2026-10-05');
    expect(doc.date_end).toBeNull();
  });

  it('keeps a day corrected since the pick, and brings back no old end date', () => {
    // A draft of the 8th, an activity of the 4th, the day corrected to the
    // 3rd, the trace replaced: the 8th coming back alone as the end date
    // would publish an outing « from the 3rd to the 8th ».
    const doc = outing({ date_start: '2026-10-08', date_end: '2026-10-08' });
    const pick = tap(doc, jog, '2026-10-04');
    doc.date_start = '2026-10-03';
    expect(giveBackTracePick(pick, false)).toBe(false);
    expect(doc.date_start).toBe('2026-10-03');
    expect(doc.date_end).not.toBe('2026-10-08');
  });

  it('keeps the days once the user has ticked the box', () => {
    // The pick's day made into several by hand: they are the user's now.
    const doc = outing();
    const pick = tap(doc, jog, '2026-10-04');
    doc.date_end = '2026-10-05';
    expect(giveBackTracePick(pick, true)).toBe(true);
    expect(doc).toEqual(outing({ date_start: '2026-10-04', date_end: '2026-10-05' }));
  });
});
