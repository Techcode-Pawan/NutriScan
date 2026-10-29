# OCR: nutrition-label and ingredient extraction

**Engine:** [tesseract.js](https://github.com/naptha/tesseract.js) (Tesseract compiled to WebAssembly). It runs locally inside the API, with no system install and no paid service. On first use it downloads `eng.traineddata` (~10 MB) once and caches it in `services/api/.tesseract-cache`. For fully offline machines, put the file in a folder and set `OCR_LANG_PATH`.

## Pipeline

| Step | Where |
|---|---|
| 1. Upload validation | `POST /api/ocr/label` (multipart `image`): JPEG/PNG/WebP only, ≤ 8 MB, decoded with sharp to verify it really is an image of at least 200×100 px |
| 2. Preprocessing | `ocr.service.ts`: EXIF auto-rotate → upscale small images to about 1800 px wide → grayscale → contrast normalisation → sharpen |
| 3. OCR | Tesseract (`eng`), returning the raw text and engine confidence |
| 4. Parsing | `nutrition-parser.ts`: row rules for energy (prefers kcal; converts kJ), total fat, saturated fat (excludes "unsaturated"), trans fat, carbohydrate, **total** sugars (ignores "added sugars"), fibre, protein, sodium (g → mg) and salt → sodium |
| 5. Normalisation | units converted; OCR character fixes inside numbers only (`O`→`0`, `l`→`1`, comma decimal) |
| 6. Uncertainty flags | low confidence when a unit is missing, a `<` value appears, a character was corrected, or cross-checks fail (sugars > carbohydrates, saturated fat > fat, > 100 g, > 900 kcal) |
| 7. Basis detection | per 100 g / per 100 ml / unknown, with a warning when per-serving or %RDA columns are present (the first number on each row is used) |
| 8. Review | The app shows every value in an editable form, with the source line or the reason it needs checking |
| 9. Analysis | `POST /api/ocr/analyze` scores the **user-reviewed** values with INR (and ML when available). Nothing is stored. |
| 10. Submission | The user may then submit the product. It goes to `product_submissions` (status `PENDING`) and never directly into the verified product table |

## Verified behaviour

* `tests/unit/nutrition-parser.test.ts`: 12 parser tests (kJ/kcal, total vs added sugars, fat vs saturated/trans fat, O→0 correction, salt → sodium, basis warnings, multi-column warning, impossible-value flags, ingredient extraction).
* `tests/integration/ocr.test.ts` (opt-in, `RUN_OCR_TESTS=1`): a real Tesseract run on `tests/fixtures/sample-label.jpg`. It extracted all 9 fields and the ingredient list correctly at 91% engine confidence, in about 7 s including the model load. It also rejects non-image uploads.

## Known limitations

* The test image is a clean, rendered label. Real phone photos (curved packs, glare, small fonts, Hindi/bilingual text) will produce more errors; this is why review is mandatory.
* Only English is loaded. Hindi labels would need the `hin` model.
* Tables with per-serving columns depend on the first number per row being the per-100 value, and the user is warned about this.
* There is no layout analysis of table columns; parsing is line-based.
