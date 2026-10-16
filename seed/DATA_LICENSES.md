# Data attribution

Open Food Facts records are attributed to **Open Food Facts and its
contributors**. Database: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Individual database contents: [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
Read [Open Food Facts terms](https://world.openfoodfacts.org/terms-of-use) and
[API license guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/).
Keep this attribution and the source URLs with the derived seed database.
The derived clean data is supplied under ODbL 1.0; keep its share-alike terms
when redistributing the database. These terms apply to data, not the application
source code. No Open Food Facts images or original descriptions are included.

Phone model/specification facts: **jomarie04**, dataset
[smartphone-specifications-2020-2024](https://huggingface.co/datasets/jomarie04/smartphone-specifications-2020-2024),
revision `4d19b89f8123effc01aa8b97f7cc4adbfef7d20e`.
The author's dataset card and API metadata declare **MIT**. The card does not
provide a separate copyright notice; author attribution is retained here and
on source records. Approximate dataset USD prices were discarded. Maintain
the following MIT permission notice with reused dataset material:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
> of the Software, and to permit persons to whom the Software is furnished to
> do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Official catalogue pages — Walton (waltonbd.com), Bata Bangladesh
(bata.com.bd), Hatil (hatil.com) and Apex Bangladesh (apexbangladesh.com) —
were fetched within robots.txt at one request per second with an identifying
User-Agent. From them only **factual product names and listed BDT prices** were
recorded (facts are not copyrightable expression); no descriptions, images,
reviews or page markup were copied, and every derived description in the seed
is original text. Listed prices are kept verbatim as `price_basis` evidence
with fetch timestamps in `clean/source-manifest.json`; VAT and lowest-variant
caveats are flagged `needs_review` instead of silently adjusted.

Generic fallback items cite Wikipedia REST summary pages for product-type
background only (no text reused), e.g.
<https://en.wikipedia.org/api/rest_v1/page/summary/LED_bulb>. Wikipedia text
is licensed **CC BY-SA 4.0** (<https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported>);
the citations are reference metadata (URL + license stored per row), and every
such item is `needs_review=true` with an arbitrary in-range price — nothing
priceable is attributed to Wikipedia.

Walton LED series pages show only the lowest variant price; those rows carry a
review reason rather than a fabricated per-watt price. DGDA and BSTI lists were
unreachable (TLS errors), so no compliance certification is claimed anywhere;
`requires_bsti: null` means unverified, never certified. Source access evidence,
including all blocked or 503 responses, is in `clean/source-manifest.json` and
`raw/manifest.json`. No competitor store catalogue was requested.
