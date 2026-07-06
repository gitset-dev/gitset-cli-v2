'use strict';

function currentDateLine() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const natural = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `${natural} (${iso})`;
}

function dateAwarenessNote() {
  return `Today's real date is ${currentDateLine()}. Treat this as "today"/"now" for any ` +
    'date, year, or "released on" text you generate. Do not use a date from your training ' +
    'data or default to a past year out of habit — only reference a different date when the ' +
    'content specifically and verifiably describes a past event.';
}

module.exports = { currentDateLine, dateAwarenessNote };
