/* app.js — form wiring. Preview updates live; Generate exists so the flow
   reads clearly, not because rendering is expensive. */
(function () {
  'use strict';

  var MAX_LEN = 14;
  var DEFAULTS = ['Workout', '10k+ steps', 'Clean eating', 'Clean mind'];

  var el = {
    habits: document.getElementById('habits'),
    month: document.getElementById('month'),
    year: document.getElementById('year'),
    weekStart: document.getElementById('weekStart'),
    generate: document.getElementById('generate'),
    download: document.getElementById('download'),
    print: document.getElementById('print'),
    warn: document.getElementById('warn'),
    sheet: document.getElementById('sheet')
  };

  /* ---- build the four habit inputs ---- */
  var inputs = [];
  DEFAULTS.forEach(function (val, i) {
    var label = document.createElement('label');
    label.innerHTML =
      '<span class="lab"><span>Habit ' + (i + 1) + '</span>' +
      '<span class="count" id="count' + i + '"></span></span>';
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.value = val;
    input.id = 'habit' + i;
    input.setAttribute('aria-label', 'Habit ' + (i + 1));
    label.appendChild(input);
    el.habits.appendChild(label);
    inputs.push(input);
  });

  /* ---- month + year ---- */
  window.DFCalendar.MONTHS.forEach(function (name, i) {
    var o = document.createElement('option');
    o.value = String(i); o.textContent = name;
    el.month.appendChild(o);
  });
  var now = new Date();
  el.month.value = String(now.getMonth());
  el.year.value = String(now.getFullYear());

  /* ---- state ---- */
  function clampYear() {
    var y = parseInt(el.year.value, 10);
    if (isNaN(y)) return now.getFullYear();
    return Math.min(2100, Math.max(2020, y));
  }

  function readModel() {
    return window.DFCalendar.model({
      year: clampYear(),
      month: parseInt(el.month.value, 10),
      weekStart: el.weekStart.value,
      habits: inputs.map(function (i) { return i.value; })
    });
  }

  var current = null;

  function render() {
    inputs.forEach(function (input, i) {
      var c = document.getElementById('count' + i);
      c.textContent = input.value.length + '/' + MAX_LEN;
      c.classList.toggle('full', input.value.length >= MAX_LEN);
    });

    var model = readModel();
    var ok = model.habitCount > 0;
    el.download.disabled = !ok;
    el.print.disabled = !ok;
    el.warn.textContent = ok ? '' : 'Add at least one habit to generate a sheet.';

    if (ok) {
      current = model;
      window.DFRenderDOM.render(el.sheet, model);
    } else {
      current = null;
      el.sheet.innerHTML = '';
    }
  }

  ['input', 'change'].forEach(function (evt) {
    document.getElementById('form').addEventListener(evt, render);
  });
  el.year.addEventListener('blur', function () { el.year.value = clampYear(); render(); });

  el.generate.addEventListener('click', render);
  el.print.addEventListener('click', function () { window.print(); });
  el.download.addEventListener('click', function () {
    if (!current) return;
    el.download.disabled = true;
    el.download.textContent = 'Writing PDF…';
    // Let the button repaint before jsPDF blocks the thread embedding fonts.
    setTimeout(function () {
      try {
        window.DFRenderPDF.download(current);
      } catch (e) {
        el.warn.textContent = 'PDF failed: ' + e.message;
      }
      el.download.disabled = false;
      el.download.textContent = 'Download PDF';
    }, 20);
  });

  render();
})();
