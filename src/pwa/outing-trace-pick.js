// What an activity picked from the user's tracker puts into an outing, and
// what comes back once its trace is cleared or replaced (OutingTracePicker
// at the top of the outing form, OutingEditionView around it).
//
// One tap writes a date, a distance and a D+ over whatever was there, and
// they get published. Undoing it wrongly publishes a false figure; three
// ways were found in review before this went out:
//
//   - the figures of an activity picked by mistake stay under the trace
//     that replaces it;
//   - taking them away takes with them the D+ the user had typed before
//     the pick, and the route's theoretical one goes out in its place;
//   - the two dates, given back one by one, come back as an outing of
//     several days that nobody ticked.
//
// So a pick remembers what it replaced, and gives it back only where the
// outing still shows what the pick wrote. It also remembers its outing
// (`doc`): the form is reused from one outing to the next, and a pick
// never gives back to another one.

// What `activity` will put into the outing `doc`, and what is there now.
// `day` is the activity's local day (YYYY-MM-DD), `several` the « Several
// days? » box, read with the dates: unticked by the pick, it comes back as
// it was, not guessed from two dates that differ.
// Writes nothing yet: the form puts the trace on the map first, and the map
// dates a still undated outing from it.
export function readTracePick(doc, activity, day, several) {
  const figures = {};
  if (activity.length) figures.length_total = Math.round(activity.length);
  if (activity.heightDiffUp) figures.height_diff_up = Math.round(activity.heightDiffUp);
  const before = { date_start: doc.date_start, date_end: doc.date_end, several };
  for (const key of Object.keys(figures)) before[key] = doc[key];
  return { id: activity.id, doc, day, figures, before };
}

// The pick's single day and its figures go in. The form unticks the box.
export function writeTracePick({ doc, figures, day }) {
  Object.assign(doc, figures, { date_start: day, date_end: day });
}

// The trace of the pick is gone. Returns the « Several days? » box.
export function giveBackTracePick({ doc, before, figures, day }, several) {
  for (const [key, value] of Object.entries(figures)) {
    if (doc[key] === value) doc[key] = before[key];
  }
  // The date is one answer, both days and « Several days? »: given back
  // whole while it is still the activity's single day, kept whole once
  // the user has changed the day or ticked the box.
  if (several || doc.date_start !== day) return several;
  doc.date_start = before.date_start;
  doc.date_end = before.date_end;
  return before.several;
}
