"""Render the shareable Danish QA report from the sanitized staging receipt."""
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

root = Path(__file__).resolve().parents[2]
data = json.loads((root / "docs/saas-50-users-receipt-2026-11-03.json").read_text(encoding="utf-8"))
output = root / "output/pdf/Freyra-SaaS-50-brugerproeve.pdf"
output.parent.mkdir(parents=True, exist_ok=True)
for name, file in [("Segoe", "segoeui.ttf"), ("SegoeBold", "segoeuib.ttf")]:
    pdfmetrics.registerFont(TTFont(name, str(Path("C:/Windows/Fonts") / file)))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="SegoeBold")
green, dark, pale = map(colors.HexColor, ("#235440", "#182921", "#EAF2ED"))
muted, line = colors.HexColor("#52635A"), colors.HexColor("#CCD9D1")

def style(name, size, leading, font="Segoe", color=dark, space=0):
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading, textColor=color, spaceAfter=space)

title = style("Title", 30, 35, "SegoeBold", dark, 12)
h2 = style("Section", 17, 22, "SegoeBold", green, 8)
body = style("Body", 10.5, 15, space=9)
small = style("Small", 8.5, 12, color=muted, space=6)
label = style("Label", 9, 12, "SegoeBold", green, 7)
cell = style("Cell", 9, 12)
th = style("Header", 9, 12, "SegoeBold", colors.white)

def p(text, which=body):
    return Paragraph(text, which)

def table(rows, widths):
    grid = Table([[p(escape(str(v)), th if i == 0 else cell) for v in row] for i, row in enumerate(rows)], colWidths=widths, repeatRows=1)
    grid.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), green), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [pale, colors.white]),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, line),
    ]))
    return grid

def page_frame(canvas, doc):
    width, height = A4
    canvas.setTitle("Freyra - SaaS-prøve med 50 brugere")
    canvas.setFillColor(green)
    canvas.rect(0, height - 8, width, 8, fill=1, stroke=0)
    canvas.setFont("SegoeBold", 9)
    canvas.drawString(48, height - 38, "FREYRA / PRODUKTKVALITET")
    canvas.setFont("Segoe", 8)
    canvas.setFillColor(muted)
    canvas.drawRightString(width - 48, height - 38, "TESTMILJØ  |  3. NOVEMBER 2026")
    canvas.setStrokeColor(line)
    canvas.line(48, 42, width - 48, 42)
    canvas.drawString(48, 28, f"Prøve {data['run']}  |  Kilde {data['sourceRevision'][:7]}")
    canvas.drawRightString(width - 48, 28, str(doc.page))

story = [p("TEKNISK ACCEPTPRØVE", label), p("50 brugere i Freyra", title),
         p("<b>Projektforløbet virker i testmiljøet. Freyra er endnu ikke frigivelsesklar som samlet SaaS-produkt.</b>"),
         table([["Brugere", "Testorganisationer", "Godkendte opgaveforløb"], [50, 8, data["workflow"]["approvedTasks"]]], [150, 160, 189]),
         Spacer(1, 16), p("Fejlen vi fandt og rettede", h2),
         p("Alle otte feltmedarbejdere kunne gemme registreringer og originalfotos, men fik afvist at gemme udførelsen af deres tildelte opgave. Rettelsen bruger den eksisterende opgaveadgang. Feltmedarbejderen kan nu gemme sit eget arbejde på den valgte opgave uden generel projektredigering eller mulighed for at registrere som en anden."),
         p("De samme otte opgaver blev derefter ført frem til uafhængig godkendelse. En feltmedarbejder gemte en ny version i telefonvisningen. To samtidige skrivninger gav én gemt version og én konflikt. En forældet aflevering blev returneret og erstattet; den oprindelige version blev bevaret."),
         p("Sikkerhed og bevaring", h2),
         p(f"{data['ci']['appTests']:,} app-tests og {data['ci']['databaseTests']:,} databasekontroller består, inklusive samtidighed og gendannelse. Pakkekontrollen finder 0 kendte sårbarheder i runtime-træet. Ingen fremmede originalfiler blev udleveret. Alle 50 testkonti er nu deaktiveret, med 0 aktive sessioner og 0 gyldige refresh-tokens.".replace(",", ".", 2)),
         p(f"<a href='{data['staging']}' color='#235440'><u>Åbn Freyra i testmiljøet</u></a>  |  <a href='{data['ci']['url']}' color='#235440'><u>Se den fulde CI-kørsel</u></a>", small),
         p("Syntetiske brugere og data. Godkendelserne beviser softwareforløbet, ikke en naturfaglig vurdering eller 50 menneskers oplevelse.", small), PageBreak()]

story += [p("MÅLINGER OG DÆKNING", label), p("Hvad prøven beviser", title)]
role_labels = {"owner":"Ejer", "manager":"Projektleder", "field":"Feltmedarbejder", "reviewer":"Reviewer", "viewer":"Læser", "external":"Ekstern med opgaveadgang", "unassigned":"Uden projektadgang"}
story.append(table([["Rolle", "Konti", "Browserprøver bestået"]] + [[role_labels[x["role"]], x["users"], x["browserPassed"]] for x in data["users"]["roles"]], [260, 79, 160]))
story += [Spacer(1, 12), p("Afgrænsede samtidige læsninger", h2),
          table([["Runde", "Brugere", "Median", "P95", "Maks."]] + [[w["wave"], w["users"], f"{w['p50Ms']} ms", f"{w['p95Ms']} ms", f"{w['maxMs']} ms"] for w in data["performance"]["waves"]], [99, 100, 100, 100, 100]), Spacer(1, 10),
          p(f"{data['passedChecks']} kontroller bestod på tværs af prøven. De otte oprindelige afvisninger er bevaret som fejlbevis. 14 af 64 adgangskodekald ramte Auths rategrænse; alle 50 konti loggede ind efter eventuelle genforsøg. Målingerne er korte læserunder fra én maskine, ikke en måling af produktionskapacitet."),
          p("8 rigtige TUS-overførsler, serverkontroller og genhentede originaler med samme SHA-256. Der blev prøvet manuel placering, ikke et fysisk kameras GPS. 50 adskilte browserprofiler blev kørt ved 320, 390 eller 1280 pixels, uden fremmed projektvisning eller JavaScript-fejl."),
          p("50 fremmede projektskrivninger og 50 fremmede fildownloads blev afvist. Otte eksterne opgaveadgange blev læst inden tilbagekaldelse og afvist efter. 8 projekter, 8 originaler og 9 afleveringsversioner er bevaret.", small), PageBreak()]

story += [p("VEJEN TIL KUNDEDRIFT", label), p("Det der stadig mangler", title)]
for item in data["open"]:
    story.append(p(f"<b>{escape(item['priority'])} / {escape(item['topic'])}</b><br/>{escape(item['detail'])}"))
story += [Spacer(1, 6), p("Brugeroplevelsen er næste kvalitetsmål", h2),
          p("Dinero er en relevant reference for at begynde med den opgave, brugeren skal løse. I Freyra skal projektlederen kunne se formål, næste handling, manglende grundlag og gemt resultat fra samme projekt. Feltmedarbejder og reviewer skal hver få deres egen tydelige arbejdsflade."),
          p("Næste leverance: bind den godkendte opgaveversion til en almindelig projektrapport. Prøv derefter hele forløbet med nye brugere og en fysisk telefon. Mål om de finder første handling, kan fortsætte uden hjælp og kan genåbne deres tidligere arbejde."),
          p("<a href='https://dinero.dk/support/godt-i-gang/' color='#235440'><u>Dinero: Kom godt i gang</u></a>  |  <a href='https://supabase.com/docs/guides/deployment/going-into-prod' color='#235440'><u>Supabase: driftscheckliste</u></a>", small),
          p("Kun staging er ændret. Ingen produktion, merge, invitationer eller nye betalte tjenester. Præcise versions- og testdata ligger i repositoryets maskinkvittering.", small)]

doc = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=48, rightMargin=48, topMargin=64, bottomMargin=58)
doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
print(output)
