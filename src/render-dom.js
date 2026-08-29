/* render-dom.js — paints a scene from layout.js into SVG.
   SVG's default alphabetic baseline and absolute letter-spacing map 1:1 onto
   jsPDF's text baseline and setCharSpace, so the preview is measurement-for-
   measurement the same drawing as the PDF. */
(function (global) {
  'use strict';

  var FONT_FAMILY = {
    mono: "'DF Mono', ui-monospace, monospace",
    display: "'DF Display', sans-serif"
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function n(v) { return Math.round(v * 1000) / 1000; }

  /* Install the same TTFs the PDF embeds, as data: URIs. */
  var fontsInstalled = false;
  function installFonts() {
    if (fontsInstalled || !global.DF_FONTS) return;
    var F = global.DF_FONTS;
    var css = [
      ['DF Display', F.AKIRA_EXPANDED],
      ['DF Mono', F.JETBRAINS_MONO]
    ].map(function (f) {
      return "@font-face{font-family:'" + f[0] + "';font-style:normal;" +
        "font-weight:400;font-display:block;" +
        "src:url(data:font/ttf;base64," + f[1] + ") format('truetype');}";
    }).join('\n');
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    fontsInstalled = true;
  }

  function toSVG(scene, page) {
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      page.w + ' ' + page.h + '" preserveAspectRatio="xMidYMid meet" ' +
      'shape-rendering="geometricPrecision" class="sheet-svg">');
    // jsPDF does not kern or apply ligatures; the browser does by default.
    // Turning both off is what makes the preview match the PDF exactly rather
    // than to within a fraction of a millimetre.
    out.push('<style>text{font-kerning:none;font-variant-ligatures:none;' +
      'font-feature-settings:\'kern\' 0,\'liga\' 0;}</style>');
    out.push('<rect x="0" y="0" width="' + page.w + '" height="' + page.h +
      '" fill="#FFFFFF"/>');

    for (var i = 0; i < scene.length; i++) {
      var p = scene[i];
      if (p.t === 'line') {
        out.push('<line x1="' + n(p.x1) + '" y1="' + n(p.y1) + '" x2="' + n(p.x2) +
          '" y2="' + n(p.y2) + '" stroke="' + p.color + '" stroke-width="' +
          n(p.lw) + '" stroke-linecap="butt"/>');
      } else if (p.t === 'rect') {
        out.push('<rect x="' + n(p.x) + '" y="' + n(p.y) + '" width="' + n(p.w) +
          '" height="' + n(p.h) + '" fill="none" stroke="' + p.color +
          '" stroke-width="' + n(p.lw) + '"/>');
      } else if (p.t === 'text') {
        var attrs = 'x="' + n(p.x) + '" y="' + n(p.y) + '" fill="' + p.color +
          '" font-family="' + FONT_FAMILY[p.font] + '" font-size="' + n(p.size) +
          '" text-anchor="start" xml:space="preserve"';
        if (p.track) attrs += ' letter-spacing="' + n(p.track) + '"';
        // jsPDF's angle is counter-clockwise; SVG rotate() is clockwise.
        if (p.angle) attrs += ' transform="rotate(' + (-p.angle) + ' ' +
          n(p.x) + ' ' + n(p.y) + ')"';
        out.push('<text ' + attrs + '>' + esc(p.str) + '</text>');
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  function render(mount, model) {
    installFonts();
    var scene = global.DFLayout.buildScene(model);
    mount.innerHTML = toSVG(scene, global.DFLayout.PAGE);
    return scene;
  }

  global.DFRenderDOM = { render: render, toSVG: toSVG, installFonts: installFonts };
})(window);
