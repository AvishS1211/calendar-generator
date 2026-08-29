/* layout.js — design tokens, every measurement, and the scene builder.
   Produces a flat list of drawing primitives in millimetres on the 420x297
   page. render-dom.js and render-pdf.js are dumb painters for that list, so
   the preview and the PDF are literally the same drawing program. */
(function (global) {
  'use strict';

  var M = global.DFMetrics;
  var CAP_D = M.CAP_HEIGHT.display;   // Akira Expanded, 0.7002 em
  var CAP_M = M.CAP_HEIGHT.mono;      // JetBrains Mono, 0.73 em
  var ADV_M = M.MONO_ADVANCE;         // 0.600 em

  var C = {
    ink: '#17150F',
    ink2: '#5A554C',
    rule: '#BFB9AD',
    rule2: '#E0DCD3',
    stamp: '#7A2E2E',
    paper: '#FFFFFF'
  };

  var PAGE = { w: 420, h: 297 };

  /* ---- measurements, all mm ------------------------------------------- */
  var L = {
    padTop: 11, padSide: 13, padBottom: 9,
    contentX: 13, contentR: 407, contentW: 394,

    // masthead
    eyebrowSize: 2.4, eyebrowTrack: 0.22, eyebrowCapTop: 11.0,
    monthSize: 12.5, monthCapTop: 16.6,
    yearSize: 4.2, yearGap: 4.0,
    bodySize: 2.7, bodyMaxW: 74, bodyCapTop: 11.0,
    chipH: 5.8, chipPadX: 2.2, chipGap: 2.5, chipLabelSize: 2.4,
    chipLabelTrack: 0.08, chipStroke: 0.3,
    mastheadRuleY: 31.4, heavyRule: 0.8,

    // grid
    weekdayCapTop: 36.2, weekdaySize: 2.6, weekdayTrack: 0.18,
    cellsTop: 41.6, cellsBottom: 266.2,
    railW: 18, colGap: 4,
    hairline: 0.3,

    // day cell
    cellPadV: 1.8, cellPadH: 2.4,
    // 9mm mono digits are 10.8mm wide for a zero-padded date; 12.3 keeps the
    // same ~1.4mm breathing space to the checkbox column the design had.
    dateZoneW: 12.3, dateSize: 9,
    boxSize: 5.4, boxStroke: 0.35, boxLabelGap: 2, labelSize: 2.3,
    hatchSpacing: 2.6, hatchStroke: 0.3,

    // week rail
    railTextSize: 2.2, railTextX: 4.0,
    scoreBox: 9, scoreBoxX: 7.0, scoreDenomSize: 2.2, scoreDenomPad: 1.1,

    // footer
    footerRuleY: 271.6,
    totalBoxW: 13, totalBoxH: 9.5, totalBoxBottom: 288,
    totalLabelGap: 2.5, totalLabelSize: 2.5, totalSlotGap: 9,
    totalDenomSize: 2.2, totalDenomPad: 1.1,
    footNoteSize: 2.5
  };

  L.gridX = L.contentX;
  L.dayGridW = L.contentW - L.railW - L.colGap;      // 372
  L.colW = L.dayGridW / 7;                            // 53.1428…
  L.railX = L.gridX + L.dayGridW + L.colGap;          // 389
  L.cellsH = L.cellsBottom - L.cellsTop;              // 224.6

  var BODY_COPY = 'One mark per habit, per day. Pen only.';
  var FOOT_NOTE = 'BEST WEEK ______ · LONGEST STREAK ______';
  var EYEBROW = 'DAILY FOUR · HABIT SHEET';

  /* ---- text measurement ------------------------------------------------
     Tracking is extra advance after every character, matching both CSS
     letter-spacing and jsPDF setCharSpace. Every text primitive is emitted
     left-aligned at an explicit x — we never ask a backend to right-align,
     so the two can't disagree about trailing track. */
  function monoW(str, size, trackEm) {
    var track = (trackEm || 0) * size;
    return str.length * (size * ADV_M + track);
  }
  function displayW(str, size) {
    var t = 0;
    for (var i = 0; i < str.length; i++) {
      var w = M.DISPLAY[str[i]];
      t += (w === undefined ? 0.6 : w) * size;
    }
    return t;
  }

  /* ---- primitive helpers ---------------------------------------------- */
  function line(s, x1, y1, x2, y2, color, lw) {
    s.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, color: color, lw: lw });
  }
  function rect(s, x, y, w, h, color, lw) {
    s.push({ t: 'rect', x: x, y: y, w: w, h: h, color: color, lw: lw });
  }
  function text(s, x, baseline, str, font, size, color, trackEm, angle) {
    s.push({
      t: 'text', x: x, y: baseline, str: str, font: font, size: size,
      color: color, track: (trackEm || 0) * size, angle: angle || 0
    });
  }

  /* 45-degree hatch, clipped analytically to the rect so neither backend
     needs a clip path. Lines run x + y = c; spacing is perpendicular. */
  function hatch(s, x, y, w, h, color, lw, spacing) {
    var step = spacing * Math.SQRT2;
    var x0 = x, x1 = x + w, y0 = y, y1 = y + h;
    var cStart = Math.ceil((x0 + y0) / step) * step;
    for (var c = cStart; c <= x1 + y1; c += step) {
      var xa = Math.max(x0, c - y1), xb = Math.min(x1, c - y0);
      if (xb - xa > 0.01) line(s, xa, c - xa, xb, c - xb, color, lw);
    }
  }

  /* ---- scene ----------------------------------------------------------- */
  function buildScene(m) {
    var s = [];
    var rows = m.rowCount;
    var rowH = L.cellsH / rows;

    /* ---------- masthead ---------- */
    text(s, L.contentX, L.eyebrowCapTop + L.eyebrowSize * CAP_M, EYEBROW,
      'mono', L.eyebrowSize, C.stamp, L.eyebrowTrack);

    var monthStr = m.monthName.toUpperCase();
    var monthBase = L.monthCapTop + L.monthSize * CAP_D;
    text(s, L.contentX, monthBase, monthStr, 'display', L.monthSize, C.ink);
    text(s, L.contentX + displayW(monthStr, L.monthSize) + L.yearGap, monthBase,
      String(m.year), 'mono', L.yearSize, C.ink2);

    // right: body copy, right-aligned by explicit x
    var bodyW = monoW(BODY_COPY, L.bodySize, 0);
    text(s, L.contentR - bodyW, L.bodyCapTop + L.bodySize * CAP_M, BODY_COPY,
      'mono', L.bodySize, C.ink2);

    // right: habit legend chips, laid right-to-left so the row ends flush
    var chipTop = monthBase - L.chipH;
    var cursor = L.contentR;
    for (var i = m.habits.length - 1; i >= 0; i--) {
      var lbl = m.habits[i].toUpperCase();
      var lw_ = monoW(lbl, L.chipLabelSize, L.chipLabelTrack);
      var cw = lw_ + L.chipPadX * 2;
      var cx = cursor - cw;
      rect(s, cx, chipTop, cw, L.chipH, C.rule, L.chipStroke);
      text(s, cx + L.chipPadX,
        chipTop + L.chipH / 2 + (L.chipLabelSize * CAP_M) / 2,
        lbl, 'mono', L.chipLabelSize, C.ink2, L.chipLabelTrack);
      cursor = cx - L.chipGap;
    }

    line(s, L.contentX, L.mastheadRuleY, L.contentR, L.mastheadRuleY, C.ink, L.heavyRule);

    /* ---------- weekday header ---------- */
    var wdBase = L.weekdayCapTop + L.weekdaySize * CAP_M;
    for (var c2 = 0; c2 < 7; c2++) {
      var name = m.weekdays[c2];
      var isWeekend = (m.weekStart === 'monday') ? (c2 >= 5) : (c2 === 0 || c2 === 6);
      text(s, L.gridX + c2 * L.colW + L.cellPadH, wdBase, name, 'mono',
        L.weekdaySize, isWeekend ? C.stamp : C.ink2, L.weekdayTrack);
    }

    /* ---------- day cells ---------- */
    for (var r = 0; r < rows; r++) {
      var rowTop = L.cellsTop + r * rowH;
      var row = m.rows[r];

      for (var c3 = 0; c3 < 7; c3++) {
        var cell = row.cells[c3];
        var cx2 = L.gridX + c3 * L.colW;

        if (cell.blank) {
          hatch(s, cx2, rowTop, L.colW, rowH, C.rule2, L.hatchStroke, L.hatchSpacing);
          continue;
        }

        // date — deliberately lighter than the checkboxes
        var dd = cell.day < 10 ? '0' + cell.day : String(cell.day);
        text(s, cx2 + L.cellPadH, rowTop + L.cellPadV + L.dateSize * CAP_M, dd,
          'mono', L.dateSize, cell.weekend ? C.stamp : C.ink2);

        // habit rows, evenly distributed down the cell
        var n = m.habitCount;
        var innerH = rowH - L.cellPadV * 2;
        var gap = (innerH - n * L.boxSize) / (n + 1);
        var bx = cx2 + L.cellPadH + L.dateZoneW;
        for (var k = 0; k < n; k++) {
          var by = rowTop + L.cellPadV + gap * (k + 1) + L.boxSize * k;
          rect(s, bx, by, L.boxSize, L.boxSize, C.ink, L.boxStroke);
          text(s, bx + L.boxSize + L.boxLabelGap,
            by + L.boxSize / 2 + (L.labelSize * CAP_M) / 2,
            m.habits[k].toUpperCase(), 'mono', L.labelSize, C.ink2);
        }
      }

      /* ---------- week rail ---------- */
      rect(s, L.railX, rowTop, L.railW, rowH, C.rule, L.hairline);
      var sbY = rowTop + (rowH - L.scoreBox) / 2;
      rect(s, L.railX + L.scoreBoxX, sbY, L.scoreBox, L.scoreBox, C.ink, L.boxStroke);
      var denom = '/' + m.weekDenominator;
      text(s, L.railX + L.scoreBoxX + L.scoreBox - L.scoreDenomPad -
        monoW(denom, L.scoreDenomSize, 0),
        sbY + L.scoreBox - L.scoreDenomPad, denom, 'mono', L.scoreDenomSize, C.rule);

      // ISO week, reading bottom-to-top, centred on the row
      var wk = 'W' + row.isoWeek;
      text(s, L.railX + L.railTextX,
        rowTop + rowH / 2 + monoW(wk, L.railTextSize, 0) / 2,
        wk, 'mono', L.railTextSize, C.ink2, 0, 90);
    }

    /* ---------- grid hairlines (drawn last so they sit over the hatch) --- */
    for (var v = 0; v <= 7; v++) {
      var vx = L.gridX + v * L.colW;
      line(s, vx, L.cellsTop, vx, L.cellsBottom, C.rule, L.hairline);
    }
    for (var hh = 0; hh <= rows; hh++) {
      var hy = L.cellsTop + hh * rowH;
      line(s, L.gridX, hy, L.gridX + L.dayGridW, hy, C.rule, L.hairline);
    }

    /* ---------- footer ---------- */
    line(s, L.contentX, L.footerRuleY, L.contentR, L.footerRuleY, C.ink, L.heavyRule);

    var boxTop = L.totalBoxBottom - L.totalBoxH;
    var fx = L.contentX;
    var mDenom = '/' + m.daysInMonth;
    for (var j = 0; j < m.habits.length; j++) {
      rect(s, fx, boxTop, L.totalBoxW, L.totalBoxH, C.ink, L.boxStroke);
      text(s, fx + L.totalBoxW - L.totalDenomPad - monoW(mDenom, L.totalDenomSize, 0),
        L.totalBoxBottom - L.totalDenomPad, mDenom, 'mono', L.totalDenomSize, C.rule);
      var flbl = m.habits[j].toUpperCase();
      text(s, fx + L.totalBoxW + L.totalLabelGap,
        boxTop + L.totalBoxH / 2 + (L.totalLabelSize * CAP_M) / 2,
        flbl, 'mono', L.totalLabelSize, C.ink2);
      fx += L.totalBoxW + L.totalLabelGap + monoW(flbl, L.totalLabelSize, 0) + L.totalSlotGap;
    }

    text(s, L.contentR - monoW(FOOT_NOTE, L.footNoteSize, 0),
      boxTop + L.totalBoxH / 2 + (L.footNoteSize * CAP_M) / 2,
      FOOT_NOTE, 'mono', L.footNoteSize, C.ink2);

    return s;
  }

  global.DFLayout = {
    C: C, PAGE: PAGE, L: L,
    monoW: monoW, displayW: displayW,
    buildScene: buildScene
  };
})(window);
