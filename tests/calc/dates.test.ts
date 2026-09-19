import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
  addDays,
  dayKeyOf,
  daysBetween,
  daysInRange,
  isDayKey,
  weekStartOf,
  weekdayOf,
} from '../../lib/calc/dates';

const MELBOURNE = 'Australia/Melbourne';

describe('dayKeyOf', () => {
  test('files an instant against the Melbourne calendar day, not UTC', () => {
    // 23:30 Melbourne on the 3rd is still 13:30 UTC on the 3rd.
    assert.equal(dayKeyOf(new Date('2026-10-03T13:30:00Z'), MELBOURNE), '2026-10-03');
  });

  test('the same UTC clock time lands on a different day once DST begins', () => {
    // Melbourne moves to UTC+11 at 2am on Sunday 4 October 2026. Twenty-four
    // hours after the reading above, the same UTC time is past local midnight,
    // so the day key advances by two, not one. Anything doing its own offset
    // arithmetic files this evening's weigh-in against the wrong day.
    assert.equal(dayKeyOf(new Date('2026-10-04T13:30:00Z'), MELBOURNE), '2026-10-05');
  });

  test('handles the autumn transition, when the offset shrinks', () => {
    // DST ends at 3am on Sunday 5 April 2026, back to UTC+10.
    assert.equal(dayKeyOf(new Date('2026-04-04T13:30:00Z'), MELBOURNE), '2026-04-05');
    assert.equal(dayKeyOf(new Date('2026-04-05T13:30:00Z'), MELBOURNE), '2026-04-05');
  });

  test('a late-evening weigh-in is not pushed into tomorrow', () => {
    assert.equal(dayKeyOf(new Date('2026-09-19T23:59:00+10:00'), MELBOURNE), '2026-09-19');
  });
});

describe('day arithmetic', () => {
  test('crossing a DST boundary still counts as one day', () => {
    assert.equal(addDays('2026-10-03', 1), '2026-10-04');
    assert.equal(daysBetween('2026-10-03', '2026-10-04'), 1);
  });

  test('a month containing a DST change spans the right number of days', () => {
    assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
    assert.equal(daysBetween('2026-04-01', '2026-04-30'), 29);
  });

  test('handles leap years', () => {
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(daysBetween('2028-02-01', '2028-03-01'), 29);
  });

  test('is symmetric and signed', () => {
    assert.equal(daysBetween('2026-09-19', '2026-09-12'), -7);
  });

  test('rejects days that do not exist', () => {
    assert.equal(isDayKey('2026-02-30'), false);
    assert.equal(isDayKey('2026-9-19'), false);
    assert.equal(isDayKey('2026-09-19'), true);
    assert.throws(() => addDays('2026-02-30', 1), RangeError);
  });
});

describe('weekStartOf', () => {
  test('defaults to Sunday', () => {
    assert.equal(weekdayOf('2026-09-19'), 6); // Saturday
    assert.equal(weekStartOf('2026-09-19'), '2026-09-13');
  });

  test('Sunday is its own week start', () => {
    assert.equal(weekStartOf('2026-09-13'), '2026-09-13');
  });

  test('Saturday is the last day, not the first', () => {
    // The boundary that matters: Saturday and the Sunday after it belong to
    // different weeks, so a Saturday weigh-in closes a week rather than
    // opening one.
    assert.equal(weekStartOf('2026-09-19'), '2026-09-13');
    assert.equal(weekStartOf('2026-09-20'), '2026-09-20');
  });

  test('honours a configured Monday start', () => {
    assert.equal(weekStartOf('2026-09-19', 1), '2026-09-14');
    assert.equal(weekStartOf('2026-09-14', 1), '2026-09-14');
  });

  test('is stable across a DST boundary', () => {
    // 4 October 2026 is both a Sunday and the day the clocks go forward.
    assert.equal(weekStartOf('2026-10-04'), '2026-10-04');
    assert.equal(weekStartOf('2026-10-03'), '2026-09-27');
    assert.equal(weekStartOf('2026-10-10'), '2026-10-04');
  });
});

describe('daysInRange', () => {
  test('is inclusive at both ends', () => {
    assert.deepEqual(daysInRange('2026-09-19', '2026-09-21'), [
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ]);
  });

  test('a single day is a range of one', () => {
    assert.deepEqual(daysInRange('2026-09-19', '2026-09-19'), ['2026-09-19']);
  });

  test('a reversed range is empty rather than an error', () => {
    assert.deepEqual(daysInRange('2026-09-21', '2026-09-19'), []);
  });
});
