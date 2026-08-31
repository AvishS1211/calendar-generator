/* glyphs.js — reads glyph outlines straight out of the embedded TrueType fonts.
   Used to convert text to vector paths for the print-safe PDF, so the exported
   file carries no font dependency at all. Coordinates come back in em units
   (1.0 = one em), so a caller just multiplies by the font size in mm. */
(function (global) {
  'use strict';

  function b64ToBytes(b64) {
    var bin = global.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function parse(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var u8 = function (o) { return dv.getUint8(o); };
    var u16 = function (o) { return dv.getUint16(o); };
    var i16 = function (o) { return dv.getInt16(o); };
    var u32 = function (o) { return dv.getUint32(o); };

    var tables = {}, n = u16(4);
    for (var i = 0; i < n; i++) {
      var o = 12 + 16 * i, tag = '';
      for (var j = 0; j < 4; j++) tag += String.fromCharCode(u8(o + j));
      tables[tag] = { off: u32(o + 8), len: u32(o + 12) };
    }
    if (!tables.glyf) throw new Error('font has no glyf table (CFF outlines?)');

    var upem = u16(tables.head.off + 18);
    var longLoca = i16(tables.head.off + 50) === 1;
    var numGlyphs = u16(tables.maxp.off + 4);
    var numHMetrics = u16(tables.hhea.off + 34);

    var loca = new Uint32Array(numGlyphs + 1);
    for (var k = 0; k <= numGlyphs; k++) {
      loca[k] = longLoca ? u32(tables.loca.off + 4 * k)
                         : u16(tables.loca.off + 2 * k) * 2;
    }

    /* cmap format 4 */
    var sub = null, cn = u16(tables.cmap.off + 2);
    for (var c = 0; c < cn; c++) {
      var co = tables.cmap.off + 4 + 8 * c, pid = u16(co), eid = u16(co + 2);
      if ((pid === 3 && (eid === 1 || eid === 0)) || pid === 0) {
        sub = tables.cmap.off + u32(co + 4);
      }
    }
    if (sub === null || u16(sub) !== 4) throw new Error('no format-4 cmap');
    var segX2 = u16(sub + 6), seg = segX2 / 2;
    var endO = sub + 14, startO = endO + segX2 + 2,
      deltaO = startO + segX2, rangeO = deltaO + segX2;

    function gidFor(cp) {
      for (var s = 0; s < seg; s++) {
        if (cp > u16(endO + 2 * s)) continue;
        var st = u16(startO + 2 * s);
        if (cp < st) return 0;
        var delta = i16(deltaO + 2 * s), ro = u16(rangeO + 2 * s);
        if (ro === 0) return (cp + delta) & 0xffff;
        var g = u16(rangeO + 2 * s + ro + 2 * (cp - st));
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
      return 0;
    }

    function advanceFor(gid) {
      return u16(tables.hmtx.off + 4 * Math.min(gid, numHMetrics - 1)) / upem;
    }

    /* Raw contours for one glyph, in font units. Handles composites. */
    function contoursFor(gid, depth) {
      if (depth > 5 || gid >= numGlyphs) return [];
      var start = loca[gid], end = loca[gid + 1];
      if (end <= start) return [];                      // empty glyph, e.g. space
      var o = tables.glyf.off + start;
      var nc = i16(o);
      o += 10;                                          // skip the bounding box

      if (nc < 0) {                                     // composite glyph
        var out = [], more = true;
        while (more) {
          var flags = u16(o), idx = u16(o + 2); o += 4;
          var a1, a2;
          if (flags & 1) { a1 = i16(o); a2 = i16(o + 2); o += 4; }
          else { a1 = dv.getInt8(o); a2 = dv.getInt8(o + 1); o += 2; }
          var xx = 1, xy = 0, yx = 0, yy = 1;
          if (flags & 8) { xx = yy = i16(o) / 16384; o += 2; }
          else if (flags & 0x40) { xx = i16(o) / 16384; yy = i16(o + 2) / 16384; o += 4; }
          else if (flags & 0x80) {
            xx = i16(o) / 16384; xy = i16(o + 2) / 16384;
            yx = i16(o + 4) / 16384; yy = i16(o + 6) / 16384; o += 8;
          }
          var dx = (flags & 2) ? a1 : 0, dy = (flags & 2) ? a2 : 0;
          var subC = contoursFor(idx, depth + 1);
          for (var ci = 0; ci < subC.length; ci++) {
            var pts = subC[ci], moved = [];
            for (var pi = 0; pi < pts.length; pi++) {
              var p = pts[pi];
              moved.push({
                x: xx * p.x + yx * p.y + dx,
                y: xy * p.x + yy * p.y + dy,
                on: p.on
              });
            }
            out.push(moved);
          }
          more = !!(flags & 0x20);
        }
        return out;
      }

      var endPts = [];
      for (var e = 0; e < nc; e++) { endPts.push(u16(o)); o += 2; }
      var nPts = nc ? endPts[nc - 1] + 1 : 0;
      o += 2 + u16(o);                                  // skip hinting instructions

      var flagArr = new Uint8Array(nPts);
      for (var f = 0; f < nPts;) {
        var fl = u8(o++); flagArr[f++] = fl;
        if (fl & 8) { var rep = u8(o++); while (rep-- > 0 && f < nPts) flagArr[f++] = fl; }
      }
      var xs = new Int16Array(nPts), x = 0;
      for (var xi = 0; xi < nPts; xi++) {
        var fx = flagArr[xi];
        if (fx & 2) { var d = u8(o++); x += (fx & 16) ? d : -d; }
        else if (!(fx & 16)) { x += i16(o); o += 2; }
        xs[xi] = x;
      }
      var ys = new Int16Array(nPts), y = 0;
      for (var yi = 0; yi < nPts; yi++) {
        var fy = flagArr[yi];
        if (fy & 4) { var d2 = u8(o++); y += (fy & 32) ? d2 : -d2; }
        else if (!(fy & 32)) { y += i16(o); o += 2; }
        ys[yi] = y;
      }

      var contours = [], s0 = 0;
      for (var ct = 0; ct < nc; ct++) {
        var e2 = endPts[ct], pts2 = [];
        for (var q = s0; q <= e2; q++) {
          pts2.push({ x: xs[q], y: ys[q], on: !!(flagArr[q] & 1) });
        }
        if (pts2.length) contours.push(pts2);
        s0 = e2 + 1;
      }
      return contours;
    }

    /* TrueType quadratic contour -> path commands, in em units.
       Consecutive off-curve points imply an on-curve midpoint between them. */
    function toPath(contour, scale) {
      var cmds = [], n2 = contour.length;
      if (!n2) return cmds;

      var startIdx = -1;
      for (var i2 = 0; i2 < n2; i2++) if (contour[i2].on) { startIdx = i2; break; }

      var startPt;
      if (startIdx === -1) {
        // Every point is off-curve: begin at the midpoint of the last and first.
        startPt = {
          x: (contour[0].x + contour[n2 - 1].x) / 2,
          y: (contour[0].y + contour[n2 - 1].y) / 2
        };
        startIdx = -1;
      } else {
        startPt = contour[startIdx];
      }

      var sx = startPt.x * scale, sy = startPt.y * scale;
      cmds.push(['M', sx, sy]);

      var ctrl = null;
      for (var k2 = 1; k2 <= n2; k2++) {
        var p2 = contour[(((startIdx + k2) % n2) + n2) % n2];
        if (p2.on) {
          if (ctrl) { cmds.push(['Q', ctrl.x * scale, ctrl.y * scale, p2.x * scale, p2.y * scale]); ctrl = null; }
          else cmds.push(['L', p2.x * scale, p2.y * scale]);
        } else {
          if (ctrl) {
            var mx = (ctrl.x + p2.x) / 2, my = (ctrl.y + p2.y) / 2;
            cmds.push(['Q', ctrl.x * scale, ctrl.y * scale, mx * scale, my * scale]);
          }
          ctrl = p2;
        }
      }
      if (ctrl) cmds.push(['Q', ctrl.x * scale, ctrl.y * scale, sx, sy]);
      cmds.push(['Z']);
      return cmds;
    }

    var cache = {};
    return {
      unitsPerEm: upem,
      numGlyphs: numGlyphs,
      /* { advance, path } in em units */
      glyph: function (ch) {
        if (cache[ch]) return cache[ch];
        var gid = gidFor(ch.codePointAt(0));
        var contours = contoursFor(gid, 0);
        var path = [];
        for (var i3 = 0; i3 < contours.length; i3++) {
          path = path.concat(toPath(contours[i3], 1 / upem));
        }
        return (cache[ch] = { advance: advanceFor(gid), path: path, gid: gid });
      }
    };
  }

  var loaded = {};
  function load(name, base64) {
    if (!loaded[name]) loaded[name] = parse(b64ToBytes(base64));
    return loaded[name];
  }

  global.DFGlyphs = { load: load, parse: parse };
})(window);
