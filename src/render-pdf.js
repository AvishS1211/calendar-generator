/* render-pdf.js — paints the same scene from layout.js with jsPDF's vector
   primitives (rect, line, text/paths). No html2canvas, no rasterisation: this
   sheet is almost entirely hairlines and 2.3mm type, which is exactly where a
   screenshot-based export falls apart at A3.

   Two export modes:
     outlineText: true  (default) — every glyph is drawn as vector paths and no
       font is referenced at all. This is what print shops want: their preflight
       cannot complain about fonts that aren't there, and nothing can be
       substituted. Still fully vector, so hairlines stay crisp.
     outlineText: false — text stays as text with the TTFs embedded. Smaller,
       selectable and searchable, but see stripFontResources() below for why
       jsPDF alone is not safe to send to a printer. */
(function (global) {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  var mm2pt = function (mm) { return mm * PT_PER_MM; };

  var FONT = { mono: 'DFMono', display: 'DFDisplay' };
  var FONT_DATA = { mono: 'JETBRAINS_MONO', display: 'AKIRA_EXPANDED' };

  function hexToRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)];
  }

  function embedFonts(doc) {
    var F = global.DF_FONTS;
    var defs = [
      ['DFDisplay.ttf', FONT.display, F.AKIRA_EXPANDED],
      ['DFMono.ttf', FONT.mono, F.JETBRAINS_MONO]
    ];
    for (var i = 0; i < defs.length; i++) {
      doc.addFileToVFS(defs[i][0], defs[i][2]);
      doc.addFont(defs[i][0], defs[i][1], 'normal');
    }
  }

  function glyphFont(role) {
    return global.DFGlyphs.load(role, global.DF_FONTS[FONT_DATA[role]]);
  }

  /* Draw one text run as filled vector contours.
     The glyph's own axes are mapped onto the page: u is the advance direction,
     v is the glyph's "up". At angle 0 that is (1,0) and (0,-1), because page y
     grows downward while glyph y grows upward. */
  function drawTextAsPaths(doc, p) {
    var font = glyphFont(p.font);
    var a = (p.angle || 0) * Math.PI / 180;
    var ux = Math.cos(a), uy = -Math.sin(a);
    var vx = -Math.sin(a), vy = -Math.cos(a);
    var size = p.size, pen = 0, drew = false;

    function map(gx, gy, penAt) {
      var lx = penAt + gx * size, ly = gy * size;
      return { x: p.x + ux * lx + vx * ly, y: p.y + uy * lx + vy * ly };
    }

    for (var i = 0; i < p.str.length; i++) {
      var g = font.glyph(p.str[i]);
      var path = g.path, cur = null;
      for (var c = 0; c < path.length; c++) {
        var cmd = path[c];
        if (cmd[0] === 'M') {
          cur = map(cmd[1], cmd[2], pen);
          doc.moveTo(cur.x, cur.y); drew = true;
        } else if (cmd[0] === 'L') {
          cur = map(cmd[1], cmd[2], pen);
          doc.lineTo(cur.x, cur.y);
        } else if (cmd[0] === 'Q') {
          // PDF has no quadratic operator; lift the control point to a cubic.
          var q = map(cmd[1], cmd[2], pen), e = map(cmd[3], cmd[4], pen);
          doc.curveTo(
            cur.x + 2 / 3 * (q.x - cur.x), cur.y + 2 / 3 * (q.y - cur.y),
            e.x + 2 / 3 * (q.x - e.x), e.y + 2 / 3 * (q.y - e.y),
            e.x, e.y
          );
          cur = e;
        } else if (cmd[0] === 'Z') {
          doc.close();
        }
      }
      pen += g.advance * size + (p.track || 0);
    }
    return drew;
  }

  function build(model, opts) {
    opts = opts || {};
    var outline = opts.outlineText !== false;

    var jsPDFCtor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF not loaded');

    var doc = new jsPDFCtor({
      unit: 'mm', format: 'a3', orientation: 'landscape',
      // 3 decimal places in mm is one micron — far finer than any imagesetter,
      // and it keeps outlined path data to a sane size.
      floatPrecision: 3,
      // Flate the content stream. Outlined glyphs are a lot of path operators
      // and they compress roughly 6:1; the marks themselves stay vector.
      compress: true
    });
    if (!outline) embedFonts(doc);

    var scene = global.DFLayout.buildScene(model);
    var curDraw = null, curFill = null, curLW = null, curFont = null,
      curSize = null, curSpace = null;

    for (var i = 0; i < scene.length; i++) {
      var p = scene[i];

      if (p.t === 'line' || p.t === 'rect') {
        if (p.color !== curDraw) {
          var c = hexToRGB(p.color);
          doc.setDrawColor(c[0], c[1], c[2]);
          curDraw = p.color;
        }
        if (p.lw !== curLW) { doc.setLineWidth(p.lw); curLW = p.lw; }
        if (p.t === 'line') doc.line(p.x1, p.y1, p.x2, p.y2);
        else doc.rect(p.x, p.y, p.w, p.h, 'S');   // stroke only, never filled
        continue;
      }

      if (p.t === 'text') {
        if (p.color !== curFill) {
          var fc = hexToRGB(p.color);
          doc.setTextColor(fc[0], fc[1], fc[2]);
          doc.setFillColor(fc[0], fc[1], fc[2]);
          curFill = p.color;
        }
        if (outline) {
          if (drawTextAsPaths(doc, p)) doc.fill();
          continue;
        }
        var fname = FONT[p.font];
        if (fname !== curFont) { doc.setFont(fname, 'normal'); curFont = fname; }
        var pt = mm2pt(p.size);
        if (pt !== curSize) { doc.setFontSize(pt); curSize = pt; }
        var space = p.track || 0;
        if (space !== curSpace) { doc.setCharSpace(space); curSpace = space; }
        var o = { baseline: 'alphabetic', align: 'left' };
        if (p.angle) o.angle = p.angle;
        doc.text(p.str, p.x, p.y, o);
      }
    }
    return doc;
  }

  /* jsPDF always declares the 14 standard PDF fonts (Helvetica, Courier, Times,
     Symbol, ZapfDingbats) in the page resource dictionary, whether or not the
     content stream ever selects one. A print shop's preflight walks that
     dictionary, sees fonts marked "not embedded", and either rejects the job or
     silently substitutes — which is what replaces the display face on output.
     Emptying the dictionary removes the trigger.

     The replacement is padded back to the original byte length so every offset
     in the cross-reference table stays valid; rewriting the xref is otherwise
     required and easy to get wrong. */
  function stripFontResources(pdf) {
    // Only ever rewrite object dictionaries, never the bytes inside a stream:
    // content streams are Flate-compressed binary and could in principle
    // contain this pattern, which would silently corrupt the page.
    function patchDicts(chunk) {
      return chunk.replace(/\/Font\s*<<[^>]*>>/g, function (match) {
        var empty = '/Font <<>>';
        if (match.length < empty.length) return match;
        // Pad back to the original byte length so every offset in the
        // cross-reference table stays valid; rewriting the xref is otherwise
        // required and easy to get wrong.
        return empty + new Array(match.length - empty.length + 1).join(' ');
      });
    }

    var out = '', pos = 0;
    var re = />>\s*stream\r?\n/g, m;
    while ((m = re.exec(pdf)) !== null) {
      var bodyStart = m.index + m[0].length;
      var lenMatch = /\/Length\s+(\d+)/.exec(pdf.slice(pdf.lastIndexOf('<<', m.index), m.index));
      if (!lenMatch) continue;                       // not a stream we can size
      var len = parseInt(lenMatch[1], 10);
      out += patchDicts(pdf.slice(pos, bodyStart));  // dictionary region
      out += pdf.substr(bodyStart, len);             // raw stream bytes, verbatim
      pos = bodyStart + len;
      re.lastIndex = pos;
    }
    return out + patchDicts(pdf.slice(pos));
  }

  function bytes(model, opts) {
    opts = opts || {};
    var raw = build(model, opts).output();
    if (opts.outlineText !== false) raw = stripFontResources(raw);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xff;
    return out;
  }

  function download(model, opts) {
    var blob = new Blob([bytes(model, opts)], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = model.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.DFRenderPDF = {
    build: build, bytes: bytes, download: download,
    stripFontResources: stripFontResources, mm2pt: mm2pt
  };
})(window);
