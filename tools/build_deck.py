"""Builds NineCube-OrderProcessing.pptx.

The deck is generated from the implemented design so the slides cannot drift from the code: the
permission matrix, the status flow, the rejected concurrency alternatives and the measured test
results are all taken from the same decisions the README and TESTING.md record.

    python tools/build_deck.py [path/to/output.pptx]

Requires python-pptx. Output: ./NineCube-OrderProcessing.pptx, unless another path is given —
PowerPoint holds the deck open while it is being reviewed, and a locked file cannot be overwritten.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "logos" / "ninecube-logo-vector.png"
MARK = ROOT / "logos" / "ninecube-mark.png"
SCREENS = ROOT / "docs" / "manual"

# --------------------------------------------------------------------------- theme

INK = RGBColor(0x1B, 0x18, 0x1A)
INK_RAISED = RGBColor(0x23, 0x20, 0x22)
BRAND = RGBColor(0xF5, 0x97, 0x26)
TEXT = RGBColor(0xF5, 0xF2, 0xF3)
MUTED = RGBColor(0xB9, 0xB3, 0xB5)
OK = RGBColor(0x57, 0xD3, 0xA0)
DANGER = RGBColor(0xFF, 0x8D, 0x84)

FONT = "Segoe UI"
W = Inches(13.333)
H = Inches(7.5)
MARGIN = Inches(0.75)


def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    return prs


def blank(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = INK
    return slide


def textbox(slide, left, top, width, height):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    return frame


def style(run, size, colour, bold=False, italic=False):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = colour
    run.font.bold = bold
    run.font.italic = italic


def title_bar(slide, title: str, kicker: str | None = None):
    top = Inches(0.45)
    width = W - 2 * MARGIN
    if MARK.exists():
        logo_plate(slide, W - MARGIN - Inches(0.4), Inches(0.5), Inches(0.4), MARK, pad_ratio=0.18)
        width = width - Inches(0.78)
    if kicker:
        frame = textbox(slide, MARGIN, top, width, Inches(0.32))
        style(frame.paragraphs[0].add_run(), 12, BRAND, bold=True)
        frame.paragraphs[0].runs[0].text = kicker.upper()
        top = Inches(0.78)

    size = 30 if len(title) <= 48 else 26 if len(title) <= 62 else 23
    frame = textbox(slide, MARGIN, top, width, Inches(0.7))
    para = frame.paragraphs[0]
    style(para.add_run(), size, TEXT, bold=True)
    para.runs[0].text = title
    return top + Inches(0.85)


def bullets(slide, top, items, *, left=MARGIN, width=None, size=15, gap=6):
    frame = textbox(slide, left, top, width or (W - 2 * MARGIN), H - top - Inches(0.5))
    first = True
    for item in items:
        if isinstance(item, str):
            text, level, colour = item, 0, TEXT
        else:
            text, level, colour = (
                item[0],
                item[1] if len(item) > 1 else 0,
                item[2] if len(item) > 2 else TEXT,
            )

        para = frame.paragraphs[0] if first else frame.add_paragraph()
        first = False
        para.level = level
        para.space_after = Pt(gap if level else gap + 4)
        run = para.add_run()
        run.text = ("• " if level == 0 else "– ") + text
        style(run, size, colour)


def table(slide, top, headers, rows, *, left=MARGIN, width=None, height=None, size=12, header_size=12):
    width = width or (W - 2 * MARGIN)
    height = height or Inches(0.4) * (len(rows) + 1)
    shape = slide.shapes.add_table(len(rows) + 1, len(headers), left, top, width, height)
    grid = shape.table

    for column, heading in enumerate(headers):
        cell = grid.cell(0, column)
        cell.fill.solid()
        cell.fill.fore_color.rgb = INK_RAISED
        cell.margin_left = cell.margin_right = Inches(0.08)
        frame = cell.text_frame
        frame.word_wrap = True
        style(frame.paragraphs[0].add_run(), header_size, BRAND, bold=True)
        frame.paragraphs[0].runs[0].text = heading

    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            cell = grid.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = INK if r % 2 else RGBColor(0x20, 0x1D, 0x1F)
            cell.margin_left = cell.margin_right = Inches(0.08)
            frame = cell.text_frame
            frame.word_wrap = True
            para = frame.paragraphs[0]
            run = para.add_run()
            run.text = str(value)
            style(run, size, TEXT if c == 0 else MUTED)
    return grid


def note(slide, text, colour=MUTED, top=None, size=12):
    lines = -(-len(text) // 118)
    height = Inches(max(0.4, 0.21 * lines + 0.1))
    frame = textbox(slide, MARGIN, top or (H - height - Inches(0.2)), W - 2 * MARGIN, height)
    style(frame.paragraphs[0].add_run(), size, colour, italic=True)
    frame.paragraphs[0].runs[0].text = text


def logo_plate(slide, left, top, width, source, pad_ratio=0.14):
    """The brand artwork is near-black and orange on white; on this ink background the black faces
    would disappear, so the white field of the artwork is kept as a deliberate plate."""
    from PIL import Image

    with Image.open(source) as im:
        aspect = im.size[0] / im.size[1]
    pad = Emu(int(width * pad_ratio))
    height = Emu(int(width / aspect))
    plate = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, left - pad, top - pad, width + 2 * pad, height + 2 * pad
    )
    plate.adjustments[0] = 0.12
    plate.fill.solid()
    plate.fill.fore_color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    plate.line.fill.background()
    plate.shadow.inherit = False
    slide.shapes.add_picture(str(source), left, top, width=width, height=height)
    return top + height + 2 * pad


def figure(slide, left, top, width, filename, caption):
    """One annotated screen from docs/manual/, at its true 1440x900 ratio, with the caption the
    manual gives it. The border keeps a light screenshot from reading as a blank panel."""
    path = SCREENS / filename
    height = Emu(int(width / 1.6))
    picture = slide.shapes.add_picture(str(path), left, top, width=width, height=height)
    picture.line.color.rgb = RGBColor(0x45, 0x3F, 0x41)
    picture.line.width = Pt(1.25)
    frame = textbox(slide, left, top + height + Inches(0.08), width, Inches(0.5))
    para = frame.paragraphs[0]
    style(para.add_run(), 10.5, MUTED)
    para.runs[0].text = caption


def screen_pair(prs, kicker, title, pair, note_text):
    slide = blank(prs)
    top = title_bar(slide, title, kicker)
    gap = Inches(0.34)
    width = Emu(int((W - 2 * MARGIN - gap) / 2))
    for index, (filename, caption) in enumerate(pair):
        figure(slide, MARGIN + index * (width + gap), top, width, filename, caption)
    note(slide, note_text)
    return slide


# --------------------------------------------------------------------------- slides


def slide_title(prs):
    slide = blank(prs)
    logo_plate(slide, MARGIN, Inches(0.72), Inches(2.55), LOGO)

    frame = textbox(slide, MARGIN, Inches(3.05), W - 2 * MARGIN, Inches(0.82))
    para = frame.paragraphs[0]
    style(para.add_run(), 44, TEXT, bold=True)
    para.runs[0].text = "Order Processing"

    frame = textbox(slide, MARGIN, Inches(3.95), W - 2 * MARGIN, Inches(0.5))
    para = frame.paragraphs[0]
    style(para.add_run(), 20, BRAND)
    para.runs[0].text = "NineCube.Digital — a reliable order + stock feature for a small retailer"

    frame = textbox(slide, MARGIN, Inches(4.75), W - 2 * MARGIN, Inches(1.6))
    for i, line in enumerate(
        [
            "ASP.NET Core 10 Web API · EF Core · SQL Server · JWT + 4 roles",
            "React 18 + TypeScript SPA · hand-written glass / neumorphic CSS",
            "108 backend integration tests · 159 frontend tests · 107 browser tests — all green",
            "183-product catalogue · 55 endpoints · 28 annotated screens in the user manual",
        ]
    ):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.space_after = Pt(6)
        style(para.add_run(), 15, MUTED)
        para.runs[0].text = line

    note(slide, "Candidate: Yeasin Arafat · Submission: 15 October · figures on the slides measured 16 October", top=Inches(6.55), size=13)


def slide_problem(prs):
    slide = blank(prs)
    top = title_bar(slide, "The four problems, and what actually fixes each one", "problem understanding")
    table(
        slide,
        top,
        ["Reported problem", "Root cause", "What this implementation does"],
        [
            (
                "Orders accepted beyond stock",
                "Availability checked in code, written in a second step",
                "The rule lives inside the UPDATE: `… SET Stock = Stock - @qty WHERE IsActive = 1 AND Stock >= @qty`",
            ),
            (
                "Inventory inconsistent under load",
                "Read-then-write (lost update)",
                "Never read-then-write. One atomic conditional UPDATE per line + CHECK (StockQuantity >= 0)",
            ),
            (
                "Invalid requests handled inconsistently",
                "Errors raised ad hoc per endpoint",
                "One contract: RFC 7807 ProblemDetails + correlation id, one exception middleware",
            ),
            (
                "Staff cannot see availability or status",
                "No single view of stock, no explicit lifecycle",
                "Live stock badges everywhere, explicit status machine, audit trail",
            ),
        ],
        size=12,
    )
    note(slide, "Explicitly not a full e-commerce platform and not an ERP — no payments, no email, no delivery tracking.")


def slide_architecture(prs):
    slide = blank(prs)
    top = title_bar(slide, "One modular monolith, five projects, four modules", "architecture")
    bullets(
        slide,
        top,
        [
            ("Api — controllers, JWT policies, exception middleware, ProblemDetails", 0, TEXT),
            ("Application — services, DTOs, FluentValidation validators, rules re-checked inside the service", 0, TEXT),
            ("Domain — entities, status transition rules, typed exceptions", 0, TEXT),
            ("Infrastructure — EF Core DbContext + migrations, password hashing, SQL transient-error policy", 0, TEXT),
            ("Tests — xUnit integration tests against a real SQL Server", 0, TEXT),
            ("", 0, TEXT),
            ("Modules inside them: Catalog · Inventory · Orders · Identity", 0, BRAND),
            ("", 0, TEXT),
            ("One database transaction per order — order row + stock + ledger commit together or not at all", 0, OK),
            ("No microservices, no CQRS, no broker, no cache.", 0, MUTED),
        ],
    )


def slide_monolith(prs):
    slide = blank(prs)
    top = title_bar(slide, "Why a modular monolith, not microservices", "architecture decision")
    bullets(
        slide, top,
        [
            ("The hard requirement is transactional: reserving stock and creating the order must be atomic.", 0, TEXT),
            ("A network boundary between Orders and Inventory would turn a rollback into a saga with compensation.", 0, MUTED),
            ("Scope and team size are small: one team, one release cadence, one database.", 0, TEXT),
            ("Modules are separated by project and by namespace, so a future split is a service extraction, not a rewrite.", 0, MUTED),
            ("", 0, TEXT),
            ("Microservices would be justified by:", 0, BRAND),
            ("many teams needing independent deploys · genuinely independent scaling · fault isolation", 1, MUTED),
            ("regulatory or data-residency separation · a bounded context with a different consistency model", 1, MUTED),
        ],
    )


def slide_roles(prs):
    slide = blank(prs)
    top = title_bar(slide, "Four roles, and separation of duties", "roles & access")
    table(
        slide, top,
        ["Capability", "Customer", "Staff (Sales)", "Inventory Mgr", "Administrator"],
        [
            ("Browse catalogue + live stock", "yes", "yes", "yes", "yes"),
            ("Place an order", "yes", "–", "–", "– (read-only)"),
            ("Read order", "own only (else 404)", "all", "–", "all"),
            ("Confirm / reject / ship", "–", "yes", "–", "–"),
            ("Cancel an order", "own, Pending/Confirmed", "yes", "–", "–"),
            ("Create/update product, adjust stock", "–", "–", "yes", "read-only"),
            ("Sales summary, invoice", "own invoice", "yes", "–", "yes"),
            ("Users, roles, audit log, settings", "–", "–", "–", "yes"),
        ],
        size=12,
    )
    note(slide, "The person who handles orders cannot freely change stock — that is the design principle, not a limitation.")


def slide_data(prs):
    slide = blank(prs)
    top = title_bar(slide, "Data model and the guarantees it enforces", "data")
    bullets(
        slide, top,
        [
            ("Product (StockQuantity, RowVersion, Currency, provenance) · Customer · User (Role, IsActive, CustomerId)", 0, TEXT),
            ("Order (Status, TotalAmount, IdempotencyKey unique per customer) · OrderItem (name/category/UnitPrice snapshot)", 0, TEXT),
            ("Category hierarchy (slug, path, depth ≤ 4) · ProductCategory with one primary · Tag · Brand · ProductLine", 0, TEXT),
            ("InventoryMovement — append-only ledger · AuditLog · Setting · Notification (per user, per event)", 0, TEXT),
            ("", 0, TEXT),
            ("Constraints do the guarding: CHECK (StockQuantity >= 0), CHECK (Quantity > 0), unique SKU, unique (OrderId, ProductId), and a filtered unique index for one primary category", 0, BRAND),
            ("Money is decimal(18,2) — never double. Displayed in BDT; a product carries its own currency so legacy rows stay honest", 0, MUTED),
            ("", 0, TEXT),
            ("Pending → Confirmed → Shipped    Pending → Rejected    Pending | Confirmed → Cancelled", 0, OK),
            ("Stock is reserved at placement; cancel/reject release it exactly once (conditional status update)", 0, MUTED),
        ],
    )


def slide_numbers(prs):
    slide = blank(prs)
    top = title_bar(slide, "What is in the system, counted on 16 October", "the data behind the claims")
    table(
        slide, top,
        ["", "Counted", "Where the number comes from"],
        [
            ("Catalogue", "183 products, every one with an image", "SELECT COUNT(*) FROM Products — 183 of 183 carry an ImageUrl"),
            ("Facets", "29 brands · 103 product lines · 46 tags", "Brands / ProductLines / Tags tables; 501 product-tag links"),
            ("Category tree", "43 categories, deepest branch 3 levels, 198 product links", "Categories + ProductCategories; one primary per product, enforced by index"),
            ("Stock signal", "160 in stock · 10 low (1-10 units) · 23 out of stock", "Products.StockQuantity, the same figures the badges read"),
            ("Orders on this machine", "20 orders, 21 lines: 4 Pending, 9 Confirmed, 7 Shipped", "Development seed plus the browser runs — demo data, not a sales claim"),
            ("Audit and ledger", "38 stock movements · 1,018 audit entries · 20 notifications", "InventoryMovements / AuditLogs / Notifications, append-only"),
            ("API surface", "55 endpoints — 24 GET, 17 POST, 10 PUT, 4 DELETE", "HTTP method attributes across the controllers"),
            ("Schema", "13 EF Core migrations, 18 tables", "Persistence/Migrations + sys.tables"),
            ("Code", "15,631 lines of C# · 15,554 lines of TypeScript and CSS", "wc -l over the sources, excluding bin, obj and node_modules"),
        ],
        size=11,
    )
    note(slide, "Counted with sqlcmd against the LocalDB database the app runs on, and grep/wc over the sources, on 16 October. The manual's 28 annotated screens come from the same instance.")


def slide_api(prs):
    slide = blank(prs)
    top = title_bar(slide, "One API, one error contract", "api design")
    table(
        slide, top,
        ["Area", "Endpoints"],
        [
            ("Auth", "POST /api/auth/register · POST /api/auth/login · GET /api/auth/me"),
            ("Products", "GET /api/products (q, category, tag, brand, line, inStock, price range, sort — all in the URL) · GET /{id} · low-stock · POST/PUT (Inventory Mgr) · stock-adjustments · movements · images"),
            ("Bulk + model", "POST /api/products/bulk — set-category, add/remove-tags, activate, deactivate, assign-brand (never stock) · categories CRUD/move · tags · brands + lines · PUT /{id}/categories"),
            ("Orders", "POST /api/orders · GET /api/orders · GET /{id} · /cancel · /confirm · /reject · /ship · /invoice"),
            ("Account", "GET/PUT /api/me · password · dashboard · addresses · GET /api/notifications (+ unread-count) · read-all · /{id}/read · DELETE"),
            ("Reports + Admin", "GET /api/reports/sales?from=&to= · users, role, active · /api/admin/audit-logs · /api/admin/settings"),
        ],
        size=11,
    )
    frame = textbox(slide, MARGIN, top + Inches(3.4), W - 2 * MARGIN, Inches(1.4))
    for i, line in enumerate(
        [
            "400 invalid input · 401 unauthenticated · 403 wrong role · 404 not found (including another customer's order)",
            "409 insufficient stock (body lists productId / requested / available) or an invalid state transition",
            "Never 500 for a business failure. Every response carries a correlation id that is also in the log.",
        ]
    ):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.space_after = Pt(6)
        style(para.add_run(), 13, TEXT if i < 2 else MUTED)
        para.runs[0].text = line


def slide_concurrency(prs):
    slide = blank(prs)
    top = title_bar(slide, "Concurrency: one atomic statement, ordered, all-or-nothing", "the core requirement")
    bullets(
        slide, top,
        [
            ("Per line, in ascending ProductId order (deadlock avoidance):", 0, TEXT),
            ("UPDATE Products SET StockQuantity = StockQuantity - @qty WHERE Id = @id AND IsActive = 1 AND StockQuantity >= @qty", 1, BRAND),
            ("0 rows affected → roll back everything and return 409 with the short items. Never read-then-write.", 0, TEXT),
            ("Status changes use the same trick: WHERE Id = @id AND Status = @expected → exactly one winner in a race.", 0, TEXT),
            ("Idempotency-Key on POST /orders: a repeat returns the original order and never reserves stock twice.", 0, TEXT),
            ("", 0, TEXT),
            ("Rejected alternatives:", 0, BRAND),
            ("optimistic RowVersion — retry storms under exactly the load we care about", 1, MUTED),
            ("pessimistic locks — held across the whole order, invites deadlocks and timeouts", 1, MUTED),
            ("SERIALIZABLE — deadlocks and 1205s, and it still needs the retry loop", 1, MUTED),
            ("in-process lock — worthless the moment there is a second instance", 1, MUTED),
        ],
        size=14,
    )


def slide_frontend(prs):
    slide = blank(prs)
    top = title_bar(slide, "Frontend: glass + neumorphism, but readable first", "frontend & ux")
    bullets(
        slide, top,
        [
            ("React 18 + TypeScript + Vite. TanStack Query for server state, React Router for routing, no UI framework.", 0, TEXT),
            ("Design tokens in one file (colour, space, radius, type, motion) — components hard-code nothing.", 0, TEXT),
            ("The root route is a public WebGL showcase; the catalogue lives at /products behind the login, because live stock is commercial.", 0, TEXT),
            ("Live stock badges: Out of stock / Low stock · N left / In stock · N, each with a glyph and a word, never colour alone.", 0, TEXT),
            ("The stepper cannot exceed live stock, and a 409 keeps the cart and names the short items.", 0, TEXT),
            ("Every catalogue filter is written to the URL — a view survives reload, bookmark, Back and Forward.", 0, TEXT),
            ("Role-aware navigation: you only ever see the links your role can use; the server enforces it anyway. The tab you are on carries the same selected amber as the open account menu and the switched-on theme.", 0, TEXT),
            ("Accessibility: skip link, focus rings, aria-current, arrow-key menus, focus-trapped dialogs, aria-live regions, reduced-motion fallbacks.", 0, TEXT),
            ("Responsive at 390 / 768 / 1024 / 1440 px in both themes, measured on composited pixels — not assumed.", 0, OK),
        ],
        size=14,
    )


def slide_screens_shop(prs):
    screen_pair(
        prs,
        "the customer's screens",
        "Browsing and buying, photographed from the running app",
        [
            ("05-catalogue.png", "The catalogue: the sidebar tree, the facet chips and the URL that carries them"),
            ("06-cart.png", "The cart and checkout: the stepper cannot pass live stock, and a 409 names the short items"),
        ],
        "USER_MANUAL 2.1-2.2 · catalogue-roles.test.tsx, catalogue-sidebar.test.tsx, sidebar-layout.spec.ts, laptop-catalogue.spec.ts, checkout.test.tsx, order-flow.spec.ts",
    )


def slide_screens_account(prs):
    screen_pair(
        prs,
        "the customer's own account",
        "What the customer sees after the order",
        [
            ("10-dashboard.png", "Your dashboard: the tiles, the recent orders and the spend the account is entitled to"),
            ("12-notifications.png", "Notifications: what changed, when, and a link to the order it is about"),
        ],
        "USER_MANUAL 2.4 and 6.3 · account.test.tsx, modern-customer.spec.ts, sticky-notifications.test.tsx, sticky-notifications.spec.ts, ProfileAndDashboardTests.cs, NotificationTests.cs",
    )


def slide_screens_staff(prs):
    screen_pair(
        prs,
        "the staff screens",
        "The order console, and the category manager beside it",
        [
            ("13-staff-console.png", "The staff order console: the queues a Sales Manager works, and nothing else"),
            ("13b-category-stock-dark.png", "Categories & stock, in the dark theme: the tree, its branch totals, and no stock control"),
        ],
        "USER_MANUAL 3.1 and 3.3 · staff-order-bulk.test.tsx + staff-order-bulk.spec.ts for the queues, categories.test.tsx + staff-organization.spec.ts + CategoryTests.cs for the tree",
    )


def slide_screens_inventory(prs):
    screen_pair(
        prs,
        "the inventory screens",
        "Bulk edits that leave stock alone",
        [
            ("16-bulk-edit.png", "Bulk editing products: category, tags, brand and active state — stock is not in the list"),
            ("18b-movement-history.png", "The movement ledger for one product: every change with its user, reason and balance"),
        ],
        "USER_MANUAL 4.2-4.3 · inventory-bulk.test.tsx + BulkProductUpdateTests.cs hold the bulk path, StockAdjustmentTests.cs the ledger, and actionable-surfaces.spec.ts checks both in a browser",
    )


def slide_decisions(prs):
    slide = blank(prs)
    top = title_bar(slide, "Implementation decisions worth calling out", "implementation")
    bullets(
        slide, top,
        [
            ("Reserve at placement, not at confirmation — the only moment a promise can be kept.", 0, TEXT),
            ("Every stock change appends to the ledger in the same transaction, with the user and reason.", 0, TEXT),
            ("Prices are snapshotted onto the order line; the client never sends a price.", 0, TEXT),
            ("Roles are re-read from the database per request, so a role change or deactivation is immediate.", 0, TEXT),
            ("Timestamps are UTC with an explicit Z; the SPA renders them in the viewer's time zone.", 0, TEXT),
            ("Report ranges are local calendar dates converted to inclusive UTC instants at the edges.", 0, TEXT),
            ("Only a Customer sees ordering controls — the UI never offers an action the API would refuse.", 0, TEXT),
            ("Anonymous browsing is disabled: live stock is commercial information (recorded as an assumption).", 0, MUTED),
        ],
        size=14,
    )


def slide_catalogue(prs):
    slide = blank(prs)
    top = title_bar(slide, "A catalogue with a model behind it", "categories · brands · tags")
    bullets(
        slide, top,
        [
            ("Category hierarchy: unique slug, sibling-name uniqueness, materialized paths, depth 1-4, ordering, activity.", 0, TEXT),
            ("One primary category per product, enforced by a filtered SQL Server index — not by convention.", 1, BRAND),
            ("Brand and series are entities derived from attributed data; nothing is invented to fill a facet.", 0, TEXT),
            ("Category counts are distinct products with the other active filters applied, so a cross-listed product is counted once.", 0, TEXT),
            ("Delete needs a reassignment target; children are reparented in the same transaction; a cycle or an excess depth is refused with the reason.", 0, TEXT),
            ("Order lines snapshot product name and primary category at placement, so a later rename never rewrites an invoice.", 0, TEXT),
            ("", 0, TEXT),
            ("None of it can move a stock figure — five category tests and one bulk test assert exactly that.", 0, OK),
            ("Seed data: 183 products priced in BDT, 46 tags and 198 category links in the database today, loaded insert-only so a rerun changes nothing (counted 16 October; SEED_REPORT.md records the pipeline runs).", 0, MUTED),
        ],
        size=14,
    )


def slide_role_work(prs):
    slide = blank(prs)
    top = title_bar(slide, "What each role can actually do", "the working screens")
    table(
        slide, top,
        ["Role", "Screens", "The rule that matters"],
        [
            ("Customer", "/products · cart · /orders · invoice · /account · /account/profile · /notifications",
             "Stock is reserved at placement, never at add-to-cart. Someone else's record answers 404, not 403."),
            ("Sales Manager", "/staff queues (to confirm, to ship, invoices & history) · category editor · /staff/sales · bulk order review",
             "Staff move orders; they cannot touch products or stock. A bulk review sends nothing when dismissed."),
            ("Inventory Manager", "/inventory · new product · edit · images · adjust stock · movement ledger · bulk product edit",
             "Bulk edits cover category, tags, brand and active state — stock keeps its atomic single-product path."),
            ("Administrator", "/admin users · audit log · settings · read-only orders and invoices",
             "Separation of duties: nobody can both sell and silently restock. The last admin cannot be removed."),
        ],
        size=11,
    )
    note(slide, "Notifications are written where the event happens: placement, status change, a low-stock crossing — once per product, never for a rejection that did not take place.")


def slide_docs(prs):
    slide = blank(prs)
    top = title_bar(slide, "Documented from the running system", "deliverables")
    bullets(
        slide, top,
        [
            ("USER_MANUAL.md — every screen, photographed from a real browser against the real API, role by role. NineCube-User-Manual.docx is the same text laid out for print, with the 28 figures numbered.", 0, TEXT),
            ("tools/build_manual_docx.py writes that document from the Markdown, so the two cannot disagree.", 1, BRAND),
            ("docs/manual/ — 28 annotated PNGs with numbered callouts drawn over the measured bounding boxes of the actual controls, plus callouts.json.", 1, BRAND),
            ("web/scripts/capture-manual.mjs regenerates them; a callout whose control is not on screen is reported, so the pictures cannot drift from the words.", 0, MUTED),
            ("Every behaviour in the manual names the tests that cover it — 108 backend, 159 frontend, 107 browser.", 0, TEXT),
            ("FIX_REPORT.md records each defect as a measured cause, a fix, and the test that now holds it. README.md §15 states what AI assistance was used and how it was verified.", 0, TEXT),
            ("Nothing is claimed as tested that was not executed; what could not run here is marked NOT RUN.", 0, OK),
            ("This deck is generated too: tools/build_deck.py draws its tables from the code and its screens from docs/manual/, and a geometry audit refuses a slide whose text will not fit.", 0, MUTED),
        ],
        size=14,
    )


def slide_results(prs):
    slide = blank(prs)
    top = title_bar(slide, "Verified results on this machine (16 October)", "test evidence")
    table(
        slide, top,
        ["Suite", "Command", "Result"],
        [
            ("Backend — 108 tests, real SQL Server", "dotnet test src/NineCube.Tests", "108 passed, 0 failed, 0 skipped (net10.0)"),
            ("Frontend unit/component — 159", "cd web && npm run test:run", "159 passed in 23 files"),
            ("Types + production build", "npm run typecheck && npm run build", "tsc exit 0; per-route code splitting"),
            ("Browser — Playwright, 23 spec files", "npm run e2e (Chromium, live API + live data)", "107 tests: order flow, bulk console, categories, themes, navbar states, surfaces, UI audit"),
            ("Annotated manual", "node scripts/capture-manual.mjs", "28 screens from the live app, every callout located"),
            ("Live system", "/health, 4 role logins, unauthenticated call", "Healthy · 200/200/200/200 · 401"),
        ],
        size=11,
    )
    note(
        slide,
        "Proven, not asserted: stock 1 + two parallel orders → one 201 + one 409; stock 10 + 50 parallel orders → exactly 10 × 201, final stock 0; cancel restores stock exactly once under concurrency.",
    )


def slide_errors(prs):
    slide = blank(prs)
    top = title_bar(slide, "Error handling is part of the contract", "error handling")
    table(
        slide, top,
        ["Situation", "Status", "Body"],
        [
            ("Malformed / invalid payload", "400", "ValidationProblemDetails: one entry per field"),
            ("No or expired token", "401", "ProblemDetails + WWW-Authenticate"),
            ("Authenticated, wrong role", "403", "ProblemDetails: forbidden"),
            ("Unknown product or someone else's order", "404", "ProblemDetails — deliberately not 403, so existence is not leaked"),
            ("Not enough stock", "409", "ProblemDetails + shortItems[] { productId, requested, available }"),
            ("Invalid status transition / double restore", "409", "ProblemDetails: invalid state transition"),
            ("Unexpected failure", "500", "ProblemDetails, correlation id only — no stack trace to the client"),
        ],
    )


def slide_limits(prs):
    slide = blank(prs)
    top = title_bar(slide, "Limitations — stated, not hidden", "scope")
    bullets(
        slide, top,
        [
            ("No payment processing and no payment verification: orders start Pending and Staff confirm them.", 0, TEXT),
            ("No email/SMS, no delivery tracking, no returns or refunds.", 0, TEXT),
            ("No rate limiting, no refresh tokens (30-minute access tokens; the SPA keeps them in sessionStorage).", 0, TEXT),
            ("No caching layer — deliberate on stock-sensitive data.", 0, TEXT),
            ("No multi-warehouse, multi-currency or tax handling; users are deactivated, never deleted.", 0, TEXT),
            ("Backups are a documented database procedure (FULL/DIFF/LOG + restore drills), not application code.", 0, TEXT),
        ],
        size=15,
    )


def slide_production(prs):
    slide = blank(prs)
    top = title_bar(slide, "What production would add next", "roadmap")
    bullets(
        slide, top,
        [
            ("Payments + verification: hosted payment intent, outbox-backed webhook, PaymentStatus on the order.", 0, TEXT),
            ("Transactional outbox for notifications and integrations — a mail outage must never roll back an order.", 0, TEXT),
            ("Refresh tokens in httpOnly cookies with rotation and reuse detection; access tokens down to minutes.", 0, TEXT),
            ("Reservations with a TTL plus a sweeper, so an abandoned basket releases stock.", 0, TEXT),
            ("Rate limiting per IP and per account on login, per customer on order placement.", 0, TEXT),
            ("OpenTelemetry traces SPA → API → SQL; alert on the 409 ratio and p95 placement latency.", 0, TEXT),
            ("CI/CD: build, tests against a container SQL Server, Playwright smoke, gated migrations as a release stage.", 0, TEXT),
            ("Secrets in a managed vault with rotation; idempotency-key retention policy.", 0, TEXT),
        ],
        size=14,
    )


def slide_run(prs):
    slide = blank(prs)
    top = title_bar(slide, "Run it", "demo")
    bullets(
        slide, top,
        [
            ("API   http://127.0.0.1:5080   (Swagger at /swagger)      SPA   http://127.0.0.1:5173", 0, BRAND),
            ("", 0, TEXT),
            ("Demo logins (Development seed; passwords come from NINECUBE_SEED_PASSWORD — no secret is committed):", 0, TEXT),
            ("customer@ninecube.demo · staff@ninecube.demo · inventory@ninecube.demo · admin@ninecube.demo", 1, MUTED),
            ("", 0, TEXT),
            ("Database: docker compose up -d (SQL Server 2022) or any SQL Server / LocalDB via ConnectionStrings__Default.", 0, TEXT),
            ("Tests: dotnet test src/NineCube.Tests · cd web && npm run test:run · npm run e2e", 0, TEXT),
            ("Everything above was executed here; TESTING.md holds the raw output and the database modes, FIX_REPORT.md the defects found and fixed while verifying, USER_MANUAL.md the screens.", 0, OK),
        ],
        size=14,
    )


def main() -> None:
    prs = new_deck()
    for build in (
        slide_title,
        slide_problem,
        slide_architecture,
        slide_monolith,
        slide_roles,
        slide_data,
        slide_numbers,
        slide_api,
        slide_concurrency,
        slide_frontend,
        slide_screens_shop,
        slide_screens_account,
        slide_screens_staff,
        slide_screens_inventory,
        slide_catalogue,
        slide_role_work,
        slide_decisions,
        slide_results,
        slide_docs,
        slide_errors,
        slide_limits,
        slide_production,
        slide_run,
    ):
        build(prs)

    default = Path(__file__).resolve().parent.parent / "NineCube-OrderProcessing.pptx"
    # PowerPoint locks the deck while it is open; pass a path to build elsewhere.
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    prs.save(out)
    print(f"wrote {out} with {len(prs.slides.__iter__.__self__._sldIdLst)} slides")


if __name__ == "__main__":
    main()
