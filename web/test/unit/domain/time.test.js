import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  CalendarDate, Clock, DayOfWeek, Enumeration, FixedClock, TimeOfDay, ValidationError, ZoneClock,
} from '../../../src/domain/index.js';

describe('CalendarDate', () => {
  it('parses, prints and compares ISO dates', () => {
    const d = CalendarDate.parse('2026-11-11');
    assert.equal(d.toString(), '2026-11-11');
    assert.equal(JSON.stringify({ d }), '{"d":"2026-11-11"}');
    assert.equal(d.year, 2026);
    assert.equal(d.month, 11);
    assert.equal(d.day, 11);
    assert.ok(d.equals(CalendarDate.of(2026, 11, 11)));
    assert.ok(d.isBefore(CalendarDate.of(2026, 11, 12)));
    assert.ok(d.isAfter(CalendarDate.of(2026, 11, 10)));
    assert.equal(CalendarDate.parse(d), d);
    assert.equal(d.equals('2026-11-11'), false);
  });

  it('rejects malformed and impossible dates', () => {
    assert.throws(() => CalendarDate.parse('11/11/2026'), ValidationError);
    assert.throws(() => CalendarDate.parse(''), ValidationError);
    assert.throws(() => CalendarDate.of(2026, 2, 30), ValidationError);
    assert.throws(() => CalendarDate.of(2026, 1.5, 1), ValidationError);
    assert.throws(() => CalendarDate.of(99, 1, 1), ValidationError);
  });

  it('does date arithmetic across months and years', () => {
    const d = CalendarDate.of(2026, 12, 30);
    assert.equal(d.plusDays(3).toString(), '2027-01-02');
    assert.equal(d.minusDays(30).toString(), '2026-11-30');
    assert.equal(d.daysUntil(CalendarDate.of(2027, 1, 2)), 3);
  });

  it('knows the day of the week and the start of the week', () => {
    assert.equal(CalendarDate.of(2026, 11, 11).dayOfWeek, DayOfWeek.WEDNESDAY);
    assert.equal(CalendarDate.of(2026, 11, 15).dayOfWeek, DayOfWeek.SUNDAY);
    assert.equal(CalendarDate.of(2026, 11, 15).startOfWeek().toString(), '2026-11-09');
  });

  it('counts whole years like java.time.Period', () => {
    const birth = CalendarDate.of(1990, 3, 14);
    assert.equal(birth.yearsUntil(CalendarDate.of(2026, 3, 13)), 35);
    assert.equal(birth.yearsUntil(CalendarDate.of(2026, 3, 14)), 36);
  });

  it('formats like the Java version', () => {
    const d = CalendarDate.of(2026, 11, 6);
    assert.equal(d.formatLong(), 'November 06, 2026 (Friday)');
    assert.equal(d.formatMedium(), 'Nov 6, 2026');
  });

  it('is immutable', () => {
    const d = CalendarDate.of(2026, 11, 11);
    assert.ok(Object.isFrozen(d));
    assert.throws(() => {
      /** @type {any} */ (d).extra = 1;
    }, TypeError);
  });
});

describe('TimeOfDay', () => {
  it('parses, prints and compares times', () => {
    const t = TimeOfDay.parse('9:30');
    assert.equal(t.toString(), '09:30');
    assert.equal(t.toJSON(), '09:30');
    assert.equal(t.hour, 9);
    assert.equal(t.minute, 30);
    assert.equal(t.totalMinutes, 570);
    assert.equal(t.format12h(), '09:30 AM');
    assert.equal(TimeOfDay.of(0, 5).format12h(), '12:05 AM');
    assert.equal(TimeOfDay.of(12).format12h(), '12:00 PM');
    assert.equal(TimeOfDay.of(16, 0).format12h(), '04:00 PM');
    assert.ok(t.isBefore(TimeOfDay.of(10)));
    assert.ok(t.isAfter(TimeOfDay.of(9)));
    assert.ok(t.equals(TimeOfDay.of(9, 30)));
    assert.equal(t.equals('09:30'), false);
    assert.equal(TimeOfDay.parse(t), t);
  });

  it('adds minutes and measures gaps', () => {
    const t = TimeOfDay.of(8);
    assert.equal(t.plusMinutes(45).toString(), '08:45');
    assert.equal(t.minutesUntil(TimeOfDay.of(9, 15)), 75);
    assert.equal(TimeOfDay.of(23, 30).plusMinutes(60).toString(), '23:59');
  });

  it('rejects invalid times', () => {
    assert.throws(() => TimeOfDay.parse('25:00'), ValidationError);
    assert.throws(() => TimeOfDay.parse('9am'), ValidationError);
    assert.throws(() => TimeOfDay.of(9, 60), ValidationError);
    assert.throws(() => new TimeOfDay(1440), ValidationError);
  });
});

describe('DayOfWeek (Enumeration)', () => {
  it('lists the seven days in order and finds them by code or number', () => {
    assert.equal(DayOfWeek.values().length, 7);
    assert.equal(DayOfWeek.from('FRIDAY'), DayOfWeek.FRIDAY);
    assert.equal(DayOfWeek.from(DayOfWeek.FRIDAY), DayOfWeek.FRIDAY);
    assert.equal(DayOfWeek.ofNumber(7), DayOfWeek.SUNDAY);
    assert.throws(() => DayOfWeek.ofNumber(8), RangeError);
    assert.throws(() => DayOfWeek.from('FUNDAY'), ValidationError);
    assert.equal(DayOfWeek.MONDAY.shortLabel, 'Mon');
    assert.equal(String(DayOfWeek.MONDAY), 'Monday');
    assert.equal(JSON.stringify(DayOfWeek.MONDAY), '"MONDAY"');
  });

  it('describes a set of days Monday-first', () => {
    assert.equal(DayOfWeek.describe([DayOfWeek.FRIDAY, DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]), 'Mon, Wed, Fri');
    assert.equal(DayOfWeek.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY).size, 5);
  });

  it('cannot be instantiated after it is sealed, and Enumeration is abstract', () => {
    assert.throws(() => new DayOfWeek('X', 'X', 8), TypeError);
    assert.throws(() => new Enumeration('X', 'X'), TypeError);
    assert.ok(Object.isFrozen(DayOfWeek.MONDAY));
  });
});

describe('Clock', () => {
  afterEach(() => Clock.use(undefined));

  it('is abstract', () => {
    assert.throws(() => new Clock(), TypeError);
  });

  it('a FixedClock reports the set moment and decides what is in the past', () => {
    const clock = new FixedClock('2026-11-11', '10:00');
    assert.equal(clock.today().toString(), '2026-11-11');
    assert.ok(clock.isPast(CalendarDate.of(2026, 11, 10), TimeOfDay.of(23)));
    assert.ok(clock.isPast(CalendarDate.of(2026, 11, 11), TimeOfDay.of(9, 59)));
    assert.equal(clock.isPast(CalendarDate.of(2026, 11, 11), TimeOfDay.of(10)), false);
    clock.set('2026-11-12');
    assert.equal(clock.now().time.toString(), '10:00');
  });

  it('a ZoneClock reads real time in the clinic time zone', () => {
    const manila = new ZoneClock('Asia/Manila');
    assert.equal(manila.timeZone, 'Asia/Manila');
    const { date, time } = manila.now();
    assert.ok(date instanceof CalendarDate);
    assert.ok(time instanceof TimeOfDay);
  });

  it('defaults to clinic time and can be replaced', () => {
    assert.ok(Clock.current() instanceof ZoneClock);
    const fixed = new FixedClock('2030-01-01');
    Clock.use(fixed);
    assert.equal(Clock.current(), fixed);
  });

  it('a subclass that forgets now() fails clearly', () => {
    class BrokenClock extends Clock {}
    assert.throws(() => new BrokenClock().today(), /must implement the abstract method now/);
  });
});
