"""Builds NineCube-User-Manual.docx from USER_MANUAL.md.

The manual is written once, in Markdown, and the pictures are generated from the running app by
web/scripts/capture-manual.mjs. This script only lays that source out for print: a cover with the
brand artwork, a contents list, one page break per part, the 28 annotated screens as numbered
figures with the captions the Markdown gives them, and the tables and command blocks the manual
already carries.

    python tools/build_manual_docx.py [path/to/output.docx]

Requires python-docx. Output: ./NineCube-User-Manual.docx, unless another path is given.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "USER_MANUAL.md"
LOGO = ROOT / "logos" / "ninecube-logo-vector.png"
SCREENS = ROOT / "docs" / "manual"

INK = RGBColor(0x1B, 0x18, 0x1A)
BRAND = RGBColor(0xB4, 0x69, 0x00)
MUTED = RGBColor(0x5A, 0x55, 0x57)
RULE = "D9D3D5"

BODY = "Segoe UI"
MONO = "Consolas"


def shade(paragraph, colour: str):
    element = OxmlElement("w:shd")
    element.set(qn("w:val"), "clear")
    element.set(qn("w:fill"), colour)
    paragraph._p.get_or_add_pPr().append(element)


def bottom_rule(paragraph, colour: str = RULE, size: int = 6):
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), colour)
    borders.append(bottom)
    paragraph._p.get_or_add_pPr().append(borders)


def field(paragraph, instruction: str, fallback: str = ""):
    run = paragraph.add_run()
    start = OxmlElement("w:fldChar")
    start.set(qn("w:fldCharType"), "begin")
    code = OxmlElement("w:instrText")
    code.set(qn("xml:space"), "preserve")
    code.text = instruction
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(start)
    run._r.append(code)
    run._r.append(end)
    if fallback:
        paragraph.add_run(fallback)


TOKEN = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))")


def write_runs(paragraph, text: str, *, size=None, colour=None):
    """Inline Markdown into runs: bold, code, italic and links. A link keeps its address in the
    body text, because a printed manual cannot be clicked."""
    for piece in TOKEN.split(text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**"):
            run = paragraph.add_run(piece[2:-2])
            run.bold = True
        elif piece.startswith("`") and piece.endswith("`"):
            run = paragraph.add_run(piece[1:-1])
            run.font.name = MONO
            run.font.size = Pt((size or 10.5) - 0.5)
        elif piece.startswith("*") and piece.endswith("*") and len(piece) > 2:
            run = paragraph.add_run(piece[1:-1])
            run.italic = True
        elif piece.startswith("["):
            label, _, target = piece[1:].partition("](")
            run = paragraph.add_run(label)
            if target.startswith(("http", "mailto")):
                tail = paragraph.add_run(f" ({target})")
                tail.font.size = Pt((size or 10.5) - 1.5)
        else:
            run = paragraph.add_run(piece)
        if run.font.name is None:
            run.font.name = BODY
        if size and run.font.size is None:
            run.font.size = Pt(size)
        if colour is not None and run.font.color.rgb is None:
            run.font.color.rgb = colour


def figure(doc, path, alt, number):
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.paragraph_format.space_before = Pt(8)
    para.paragraph_format.keep_with_next = True
    para.add_run().add_picture(str(path), width=Cm(16.2))
    caption(doc, number, alt)


def cover(doc: Document):
    if LOGO.exists():
        band = doc.add_paragraph()
        band.alignment = WD_ALIGN_PARAGRAPH.LEFT
        band.add_run().add_picture(str(LOGO), width=Cm(5.6))
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(96)
    title = doc.add_paragraph()
    run = title.add_run("Order Processing")
    run.font.name = BODY
    run.font.size = Pt(40)
    run.bold = True
    run.font.color.rgb = INK
    sub = doc.add_paragraph()
    run = sub.add_run("User manual — NineCube.Digital")
    run.font.name = BODY
    run.font.size = Pt(17)
    run.font.color.rgb = BRAND
    bottom_rule(sub)
    for line in (
        "A walkthrough of every screen in the system, photographed from the running application and "
        "annotated with the numbers you can read against the picture.",
        "Written for the people who use it: a customer, a sales manager, an inventory manager and an "
        "administrator.",
        "Each section names the tests that prove the behaviour it describes.",
    ):
        para = doc.add_paragraph()
        para.paragraph_format.space_after = Pt(9)
        run = para.add_run(line)
        run.font.name = BODY
        run.font.size = Pt(11.5)
        run.font.color.rgb = MUTED
    meta = doc.add_paragraph()
    meta.paragraph_format.space_before = Pt(42)
    run = meta.add_run("Candidate: Yeasin Arafat    ·    Submission: 15 October    ·    "
                       "Screens regenerated from the live app on 16 October")
    run.font.name = BODY
    run.font.size = Pt(10)
    run.font.color.rgb = MUTED


def contents(doc: Document, parts):
    doc.add_page_break()
    heading = doc.add_paragraph()
    run = heading.add_run("Contents")
    run.font.name = BODY
    run.font.size = Pt(20)
    run.bold = True
    run.font.color.rgb = INK
    bottom_rule(heading)
    for title, sections in parts:
        para = doc.add_paragraph()
        para.paragraph_format.space_before = Pt(10)
        para.paragraph_format.space_after = Pt(2)
        run = para.add_run(title)
        run.font.name = BODY
        run.font.size = Pt(12)
        run.bold = True
        run.font.color.rgb = BRAND
        for label in sections:
            entry = doc.add_paragraph()
            entry.paragraph_format.left_indent = Cm(0.7)
            entry.paragraph_format.space_after = Pt(1)
            run = entry.add_run(label)
            run.font.name = BODY
            run.font.size = Pt(10.5)
            run.font.color.rgb = INK


def caption(doc, number, text):
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.paragraph_format.space_before = Pt(3)
    para.paragraph_format.space_after = Pt(14)
    para.paragraph_format.keep_with_next = False
    run = para.add_run(f"Figure {number}. ")
    run.font.name = BODY
    run.font.size = Pt(9.5)
    run.bold = True
    run.font.color.rgb = BRAND
    write_runs(para, text, size=9.5, colour=MUTED)


def add_table(doc, rows):
    header = [c.strip() for c in rows[0].strip().strip("|").split("|")]
    body = []
    for line in rows[2:]:
        body.append([c.strip() for c in line.strip().strip("|").split("|")])
    grid = doc.add_table(rows=len(body) + 1, cols=len(header))
    grid.style = "Table Grid"
    grid.alignment = WD_TABLE_ALIGNMENT.LEFT
    for column, text in enumerate(header):
        cell = grid.cell(0, column)
        cell.text = ""
        para = cell.paragraphs[0]
        write_runs(para, text, size=9.5)
        for run in para.runs:
            run.bold = True
            run.font.color.rgb = BRAND
            run.font.name = BODY
        shade_cell(cell, "F3EFEF")
    for row, values in enumerate(body, start=1):
        for column in range(len(header)):
            text = values[column] if column < len(values) else ""
            cell = grid.cell(row, column)
            cell.text = ""
            write_runs(cell.paragraphs[0], text, size=9.5)
            for run in cell.paragraphs[0].runs:
                run.font.name = run.font.name or BODY
                if run.font.size is None:
                    run.font.size = Pt(9.5)
    after = doc.add_paragraph()
    after.paragraph_format.space_after = Pt(6)


def shade_cell(cell, colour: str):
    element = OxmlElement("w:shd")
    element.set(qn("w:val"), "clear")
    element.set(qn("w:fill"), colour)
    cell._tc.get_or_add_tcPr().append(element)


def code_block(doc, lines):
    for line in lines:
        para = doc.add_paragraph()
        para.paragraph_format.left_indent = Cm(0.5)
        para.paragraph_format.space_after = Pt(1)
        shade(para, "F6F2F2")
        run = para.add_run(line if line.strip() else " ")
        run.font.name = MONO
        run.font.size = Pt(9)
        run.font.color.rgb = INK
    tail = doc.add_paragraph()
    tail.paragraph_format.space_after = Pt(4)


def footer(doc: Document):
    for section in doc.sections:
        para = section.footer.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = para.add_run("NineCube.Digital · Order Processing user manual · page ")
        run.font.name = BODY
        run.font.size = Pt(8.5)
        run.font.color.rgb = MUTED
        field(para, "PAGE")
        for extra in para.runs[-1:]:
            extra.font.name = BODY
            extra.font.size = Pt(8.5)
            extra.font.color.rgb = MUTED


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = BODY
    style.font.size = Pt(10.5)
    style.font.color.rgb = INK
    for section in doc.sections:
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = section.bottom_margin = Cm(2.0)
        section.left_margin = section.right_margin = Cm(2.2)

    parts: list[tuple[str, list[str]]] = []
    current: list[str] | None = None
    for line in lines:
        if line.startswith("## Part "):
            parts.append((line[3:].strip(), []))
            current = parts[-1][1]
        elif line.startswith("### ") and current is not None:
            current.append(line[4:].strip())

    cover(doc)
    contents(doc, parts)

    figures = 0
    doc.add_page_break()
    index = 0
    table_rows: list[str] = []
    in_code: list[str] = []
    first_heading = True
    while index < len(lines):
        line = lines[index]
        index += 1

        if in_code or line.startswith("```"):
            if line.startswith("```"):
                if in_code:
                    code_block(doc, in_code)
                    in_code = []
                continue
            in_code.append(line)
            continue

        if line.startswith("|"):
            table_rows.append(line)
            if index < len(lines) and lines[index].startswith("|"):
                continue
            add_table(doc, table_rows)
            table_rows = []
            continue

        if line.startswith("---") and set(line.strip()) == {"-"}:
            continue

        image = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if image:
            alt, target = image.group(1), image.group(2)
            path = ROOT / target
            figures += 1
            if path.exists():
                figure(doc, path, alt or path.stem, figures)
            else:
                caption(doc, figures, f"{alt} — missing image: {target}")
            continue

        if line.startswith("# "):
            continue  # the cover carries the document title

        if line.startswith("## "):
            if not first_heading:
                doc.add_page_break()
            first_heading = False
            para = doc.add_heading(level=1)
            run = para.add_run(line[3:].strip())
            run.font.name = BODY
            run.font.size = Pt(19)
            run.font.color.rgb = BRAND
            bottom_rule(para)
            continue

        if line.startswith("### "):
            para = doc.add_heading(level=2)
            run = para.add_run(line[4:].strip())
            run.font.name = BODY
            run.font.size = Pt(13.5)
            run.font.color.rgb = INK
            continue

        if re.match(r"^\d+[\.\)] ", line):
            number, _, rest = line.partition(" ")
            para = doc.add_paragraph()
            para.paragraph_format.left_indent = Cm(1.0)
            para.paragraph_format.first_line_indent = Cm(-0.6)
            para.paragraph_format.space_after = Pt(2)
            run = para.add_run(f"{number}  ")
            run.font.name = BODY
            run.font.size = Pt(10.5)
            run.bold = True
            run.font.color.rgb = BRAND
            write_runs(para, rest.strip())
            continue

        if line.startswith("- "):
            para = doc.add_paragraph(style="List Bullet")
            para.paragraph_format.space_after = Pt(2)
            write_runs(para, line[2:].strip())
            continue

        if line.startswith("> "):
            para = doc.add_paragraph()
            para.paragraph_format.left_indent = Cm(0.8)
            write_runs(para, line[2:].strip(), colour=MUTED)
            continue

        if not line.strip():
            continue

        para = doc.add_paragraph()
        para.paragraph_format.space_after = Pt(7)
        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        write_runs(para, line.strip())

    footer(doc)
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NineCube-User-Manual.docx"
    doc.save(out)
    print(f"wrote {out} with {figures} figures")


if __name__ == "__main__":
    main()
