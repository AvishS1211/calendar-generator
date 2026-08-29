"""Convert a CFF/PostScript OpenType font to TrueType (glyf) outlines.
jsPDF can only embed TrueType, so the Akira demo OTF has to be converted
before it can go in the PDF."""
import sys
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

MAX_ERR = 1.0  # in units-per-em/1000; 1.0 is the standard otf2ttf default

def otf_to_ttf(font, max_err=MAX_ERR):
    assert font.sfntVersion == "OTTO", "not a CFF OpenType font"
    glyph_order = font.getGlyphOrder()
    glyf_set = font.getGlyphSet()
    glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(glyphs)
        glyf_set[name].draw(Cu2QuPen(pen, max_err, reverse_direction=True))
        glyphs[name] = pen.glyph()

    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = glyphs

    font["loca"] = newTable("loca")
    font["maxp"].numGlyphs = len(glyph_order)
    glyf.compile(font)
    font["head"].indexToLocFormat = 0 if font["loca"].locations[-1] < 0x20000 else 1
    font["head"].glyphDataFormat = 0

    # TrueType needs these; CFF fonts don't carry them.
    for tag, ctor in (("gasp", None), ("prep", None), ("fpgm", None), ("cvt ", None)):
        pass
    del font["CFF "]
    if "VORG" in font: del font["VORG"]
    font.sfntVersion = "\000\001\000\000"
    return font

src, dst = sys.argv[1], sys.argv[2]
f = TTFont(src)
upem = f["head"].unitsPerEm
otf_to_ttf(f)
f.save(dst)
print("converted:", dst, "| upem", upem, "| glyphs", f["maxp"].numGlyphs)
