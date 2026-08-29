/* calendar.js — pure month maths. No DOM, no jsPDF.
   Shared by render-dom.js and render-pdf.js so the preview and the PDF can
   never disagree about which day falls where. */
(function (global) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Weekday headers in each week-start order. Index 0 is the leftmost column.
  var WEEKDAYS = {
    monday: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    sunday: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  };

  // Which columns are the weekend, per week-start. Used for stamp-red dates.
  var WEEKEND_COLS = { monday: [5, 6], sunday: [0, 6] };

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /* Blank cells before the 1st. getDay() is 0=Sun..6=Sat; shift for week-start. */
  function leadingBlanks(year, month, weekStart) {
    var firstDow = new Date(year, month, 1).getDay();
    return weekStart === 'sunday' ? firstDow : (firstDow + 6) % 7;
  }

  function rowCount(year, month, weekStart) {
    return Math.ceil((leadingBlanks(year, month, weekStart) + daysInMonth(year, month)) / 7);
  }

  /* ISO-8601 week number: the week is numbered by the year that owns its
     Thursday. Operates in UTC so DST can never shift a date across midnight. */
  function isoWeek(year, month, day) {
    var d = new Date(Date.UTC(year, month, day));
    var dayNum = d.getUTCDay() || 7;               // Mon=1 .. Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);     // Thursday of this ISO week
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /* Build the full grid: rowCount rows of 7 cells.
     A cell is either { day, col, weekend, iso } or { blank: true, col }.
     Each row also carries the ISO week its Thursday falls in — Thursday is the
     ISO anchor for a Monday-start row, and for a Sunday-start row it is still
     inside the Mon..Sat majority of that row. */
  function buildGrid(opts) {
    var year = opts.year, month = opts.month, weekStart = opts.weekStart || 'monday';
    var blanks = leadingBlanks(year, month, weekStart);
    var total = daysInMonth(year, month);
    var rows = rowCount(year, month, weekStart);
    var weekendCols = WEEKEND_COLS[weekStart];
    var thursdayCol = weekStart === 'monday' ? 3 : 4;

    var grid = [];
    for (var r = 0; r < rows; r++) {
      var cells = [];
      for (var c = 0; c < 7; c++) {
        var dayNum = r * 7 + c - blanks + 1;
        if (dayNum < 1 || dayNum > total) {
          cells.push({ blank: true, col: c });
        } else {
          cells.push({
            day: dayNum,
            col: c,
            weekend: weekendCols.indexOf(c) !== -1
          });
        }
      }
      // Anchor on the row's Thursday even when it falls outside the month —
      // Date normalises the overflow. Using an in-month fallback instead would
      // mislabel a trailing partial row (e.g. Nov 2026 would repeat W48).
      var anchor = new Date(year, month, r * 7 + thursdayCol - blanks + 1);
      grid.push({
        cells: cells,
        isoWeek: isoWeek(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
      });
    }
    return grid;
  }

  /* Everything a renderer needs, derived once. */
  function model(opts) {
    var habits = (opts.habits || [])
      .map(function (h) { return (h || '').trim(); })
      .filter(function (h) { return h.length > 0; })
      .slice(0, 4);

    return {
      year: opts.year,
      month: opts.month,
      monthName: MONTHS[opts.month],
      weekStart: opts.weekStart || 'monday',
      weekdays: WEEKDAYS[opts.weekStart || 'monday'],
      habits: habits,
      habitCount: habits.length,
      daysInMonth: daysInMonth(opts.year, opts.month),
      rows: buildGrid(opts),
      rowCount: rowCount(opts.year, opts.month, opts.weekStart || 'monday'),
      weekDenominator: 7 * habits.length,
      filename: 'habit-calendar-' + MONTHS[opts.month].toLowerCase() + '-' + opts.year + '.pdf'
    };
  }

  global.DFCalendar = {
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,
    daysInMonth: daysInMonth,
    isLeapYear: isLeapYear,
    leadingBlanks: leadingBlanks,
    rowCount: rowCount,
    isoWeek: isoWeek,
    buildGrid: buildGrid,
    model: model
  };
})(window);
