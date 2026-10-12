# Anatomy Atlas — interactive AISM reasoning

A local, image-free anatomy explorer with a guided question builder and a Protégé-style DL Query panel: enter a Manchester class expression and inspect inferred **subclasses**, **superclasses**, and **equivalent classes**. Uses the real **Whelk 1.2.1** reasoner and **OWL API 4.5.22** Manchester parser. AISM is bundled as an unmodified, checksummed ontology snapshot.

## Run locally

Requirements: Java **17 or newer** (21 recommended), `curl`, `tar`, and `shasum`. Python 3 is only needed for the optional integration checks. Maven is bootstrapped automatically into `.tools/`, with a verified distribution checksum; dependencies stay in `.cache/m2/`. The first build needs internet access. The ontology is bundled, and normal querying is local.

```bash
cd /Users/taravser/GitHub/anatomy-atlas
./run.sh
```

Open **http://127.0.0.1:8787**. Allow a few seconds for ontology loading and classification; the page displays progress. Stop with **Ctrl+C** in the terminal. For another port: `PORT=8788 ./run.sh`. Set `JAVA_HOME` if you need to select a particular JDK.

After cloning elsewhere, run `./run.sh` from that checkout. This command verifies the ontology checksum, builds, runs unit tests, and starts the service. No global Maven installation or Python environment is needed.

## Learn by exploring

The default **Guided question** mode lets you choose “are a kind of”, “are part of”, or “have a part that is”, then select an anatomical term. It shows the Manchester expression and explains `some` as “at least one”. Guided requests use the selected term IRI. The Manchester editor retains readable, unambiguous labels; ambiguous labels use IRIs.

Type in the structure field, Manchester editor, or anatomy explorer to see suggestions with definitions and identifiers. Search includes ontology synonyms; choosing a synonym selects the canonical term. Use arrow keys and Enter to select, Escape to dismiss. After `some`, the editor suggests classes; before an existing `some`, it suggests properties. Selecting a property in an empty expression also inserts `some`. Operator buttons insert at the cursor; Group wraps a selection in parentheses. Focus or hover explains each operator.

Term details separate **inferred kind-of hierarchy** from **directly asserted existential relationships**. The latter are not complete inherited relationships or proof explanations. Definitions are quoted verbatim from the ontology snapshot; absent definitions are labelled as absent. Synonym types are pooled for search and explicitly not presented as equivalent-class assertions.

Three short guided explorations teach leg anatomy, kind-of versus part-of, and combining conditions. Recent successful questions are retained for the current page session (up to eight). Switching a supported simple question back to guided mode works automatically. More complex expressions remain in the editor, with an explanation, rather than being discarded. “Immediate matches only” is the direct-hierarchy option.

## Queries to try

```text
'part of' some 'insect leg'
```

```text
tibia
```

```text
'insect leg'
```

```text
'part of' some ('part of' some 'insect leg')
```

```text
'appendage segment' and ('part of' some 'insect leg')
```

The ontology label is **insect leg**, not simply **leg**. Labels are case-sensitive. Quote labels containing spaces. Identifiers such as `AISM:0000031`, `AISM_0000031`, and `<http://purl.obolibrary.org/obo/AISM_0000031>` also work. `part_of` is an alias for `BFO:0000050` / `'part of'`. The term finder inserts full IRIs so duplicate labels cannot select the wrong class. Ambiguous labels are rejected.

- **Run query** or **Cmd/Ctrl+Enter** updates all three result columns.
- **Direct only** limits strict subclass/superclass results to immediate inferred neighbours.
- **Include owl:Thing / owl:Nothing** shows the built-in classes, hidden by default.
- Click a result to open its definition, synonyms, inferred immediate parents/children and directly asserted anatomical relationships. This preserves the current question.
- Equivalent-class results include a named query itself, following OWL API node semantics. Anonymous expressions may have no named equivalent.
- Unsatisfiable expressions show a warning, including when `owl:Nothing` is hidden.

## Scope and limitations

This first version accepts an **EL Manchester query fragment**: named classes, existential restrictions (`some`), intersections (`and`), and parentheses. Other forms (`or`, `not`, `only`, cardinalities, inverse expressions, data-value restrictions) are explicitly rejected rather than advertised as complete DL reasoning. The full Manchester parser handles entity resolution after a structural validation pass; this pass prevents incomplete inputs such as `part_of some` being silently accepted by OWL API.

The ontology itself contains axioms outside what Whelk's adapter translates. For the supplied AISM snapshot, the initial audit found **21 untranslated logical axioms** (5 EquivalentClasses, 1 EquivalentObjectProperties, 8 SubClassOf, 4 SubDataPropertyOf, 3 SubPropertyChainOf), with **13 axioms containing untranslated nested expressions** (these counts overlap). The page prominently reports this limitation and exposes the counts. Translation coverage is not a proof of completeness for all OWL DL constructs. Results may omit inferences requiring unsupported axioms. No named unsatisfiable classes were found in the initial snapshot test.

This is a **reasoner-backed local web application**, not yet a standalone HTML export or a GitHub Pages app. GitHub can host the source, but Java must run somewhere to answer queries. There is no SPARQL mode, ontology editing, instance tab, proof/explanation generation, image viewer, or mask integration in this prototype. Whelk is loaded once per server process; its query adapter extends the classified state temporarily for anonymous queries. API queries are serialized to avoid concurrent adapter state concerns.

The service binds only to `127.0.0.1`; it is a local prototype, not a hardened public query endpoint. Complex queries have no hard execution timeout because the Whelk adapter does not implement cancellation. A public deployment would need resource limits and a separate service design. No changes to Label Studio, SAM or Baserow are involved.

## Validation

```bash
./mvnw test
# With the local server already running:
python3 scripts/smoke_test.py
```

Unit tests cover inferred existential membership, strict/direct hierarchy results, equivalence, intersections, IRI lookup, malformed and unsupported expressions, query-state isolation, and unsatisfiability. Integration checks use the real AISM snapshot: tibia's three subclasses (protibia, mesotibia, metatibia), inferred leg-part membership, label/identifier agreement, direct results, and API error responses. The initial integration run passed: `tibia` returned 3 subclasses; `'part of' some 'insect leg'` returned 126 subclasses (32 direct), with the latter query taking 28 ms in that run. Timing varies with hardware and JVM warm-up. A GitHub Actions workflow repeats the build and both test layers.

## Files and API

- `src/main/java/org/anatomyatlas/QueryEngine.java`: ontology labels, Whelk adapter, results and coverage audit.
- `src/main/java/org/anatomyatlas/QuerySyntax.java`: validation of the supported input fragment.
- `src/main/java/org/anatomyatlas/Server.java`: same-origin localhost HTTP service.
- `src/main/resources/web/`: browser interface, no frontend build chain.
- `data/aism.owl`, `data/provenance.json`, `data/SHA256SUMS`: fixed input and provenance.
- `scripts/smoke_test.py`: AISM integration checks.

`GET /api/status` returns loading state, version and coverage. `GET /api/terms?q=tibia&kind=class` searches labels, identifiers and synonyms (optional kind: class/property). `GET /api/term?iri=...` returns a term definition, synonyms, source, inferred immediate parents/children, and directly asserted named-target existential relationships. `POST /api/query` accepts JSON:

```json
{"expression":"'part of' some 'insect leg'","direct":false,"builtins":false}
```

The response contains `subclasses`, `superclasses`, `equivalents`, `satisfiable`, and `elapsedMs`. Each class contains its IRI, compact identifier, label and definition. HTTP 400 denotes an invalid or unsupported query; HTTP 503 denotes a reasoner that is not ready.

## Data and attribution

The [AISM ontology](https://obofoundry.org/ontology/aism.html), by the AISM contributors, is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This repository preserves the original merged OWL bytes and annotations, including imported vocabulary attribution. The snapshot reports version **2026-02-14**, 8,614 classes and 31,886 logical axioms. See `data/provenance.json` for the retrieval source, date and checksum. This merged file has no external import declarations; no ontology imports are silently dropped.

[Whelk](https://github.com/INCATools/whelk) is BSD-3-Clause licensed. See Balhoff & Mungall, [Whelk: An OWL EL+RL Reasoner Enabling New Use Cases](https://doi.org/10.4230/TGDK.2.2.7). The [browser demonstration](https://github.com/balhoff/whelk-web) informed the architecture; this prototype uses the JVM OWL API integration. Dependency licenses remain with their authors. No dependency binaries or build caches need to be committed.

## Annotated images (pilot)

Open `/images.html` from the running atlas. Load an `anatomy-atlas` v1 JSON export from Label Studio. Images and per-instance binary masks remain in the browser; selection retrieves term definitions from the existing ontology API. Filter masks by term, synonym or instance name, toggle visibility, adjust opacity, and click repeatedly to cycle overlapping masks. The export records its ontology snapshot; current atlas lookup is shown separately from the exported definition.

The Label Studio integration and one-command exporter are documented in `/Users/taravser/GitHub/label-studio/ONTOLOGY-INTEGRATION.md`. This is an image/term bridge, not yet a Phenoscript `.yphs` editor or synchronizer. Exported entity IDs distinguish specimen parts from ontology classes; cross-image entity matching remains explicit future work.

## Query-linked Label Studio masks

The main page now includes the Grebennikovius image and an interactive mask viewer. Annotation 10 (six masks, five classes) is selected initially; annotation 9 remains separately available. The original export in `label-studio-export/` is unchanged. Annotation notes and the explicitly named unreviewed demonstration region are retained.

Run a question, then scroll to **See the anatomy**. `pronotum` selects two masks; `tibia` selects the metatibia mask; `antenna` selects none. Matching joins full ontology IRIs against **all inferred subclasses plus equivalent classes**, including the queried named class itself. Superclasses do not automatically select masks. “Immediate matches only” changes the hierarchy lists, not image membership. Contradictory queries have no image matches. Whelk's existing incomplete axiom coverage still applies.

Click a coloured region (repeated clicks cycle overlapping masks), or a region in the list, to read its ontology definition and hierarchy. The term panel offers **Show masks of this exact term**. Use **Return to query matches** to restore the inferred selection. Per-region visibility, faint nonmatches, opacity, zoom, drag-to-pan and fit controls are available. A failed query retains and explicitly labels the previous image selection.

The portable bundle is `src/main/resources/web/atlas/`: a manifest, normalized photograph and one binary PNG per mask. It includes source checksums, ontology version/checksum, project/task/annotation/region IDs, original image reference, review notes and full term IRIs. PNG masks preserve overlaps and same-term regions independently; no specimen OWL assertions are created. The file named `Grebennikovius.png` in the supplied export actually contains JPEG bytes; the generated image is a genuine PNG.

To import another **single-task, single-image export with the same Label Studio controls** (`mask` brush labels and `anatomy` taxonomy joined by region ID), use Python 3 and Pillow:

```sh
python3 -m venv .venv-import
.venv-import/bin/pip install 'Pillow>=10,<14'
.venv-import/bin/python scripts/import_masks.py \
  label-studio-export/project-3-at-2026-10-08-13-58-82079738.json \
  --image label-studio-export/Grebennikovius.png \
  --ontology data/aism.owl \
  --output /tmp/anatomy-atlas-new-bundle
```

Choose a new output directory: the importer refuses overwrites. It validates RLE lengths, dimensions, zero rotation, one ontology IRI per mask, and nonempty geometry; reports unknown IRIs; and ignores duplicate geometry in taxonomy/metadata records. Review the generated bundle before replacing the served `web/atlas` directory and rebuilding. This prototype ships one dataset; arbitrary browser uploads, multiple-image galleries and custom ontology sessions are not implemented yet. Static assets are portable to GitHub Pages, but the current localhost server still requires a separately deployed backend and cross-origin configuration for public hosting.

Checks:

```sh
./mvnw test
.venv-import/bin/python scripts/test_import_masks.py
python3 scripts/smoke_test.py
python3 scripts/smoke_masks.py
```
