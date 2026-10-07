# Anatomy Atlas — interactive AISM reasoning

A local, image-free prototype of a Protégé-style DL Query panel: enter a Manchester class expression and inspect inferred **subclasses**, **superclasses**, and **equivalent classes**. Uses the real **Whelk 1.2.1** reasoner and **OWL API 4.5.22** Manchester parser. AISM is bundled as an unmodified, checksummed ontology snapshot.

## Run locally

Requirements: Java **17 or newer** (21 recommended), `curl`, `tar`, and `shasum`. Python 3 is only needed for the optional integration checks. Maven is bootstrapped automatically into `.tools/`, with a verified distribution checksum; dependencies stay in `.cache/m2/`. The first build needs internet access. The ontology is bundled, and normal querying is local.

```bash
cd /Users/taravser/GitHub/anatomy-atlas
./run.sh
```

Open **http://127.0.0.1:8787**. Allow a few seconds for ontology loading and classification; the page displays progress. Stop with **Ctrl+C** in the terminal. For another port: `PORT=8788 ./run.sh`. Set `JAVA_HOME` if you need to select a particular JDK.

After cloning elsewhere, run `./run.sh` from that checkout. This command verifies the ontology checksum, builds, runs unit tests, and starts the service. No global Maven installation or Python environment is needed.

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
- Click a result to query that class; hover for its definition.
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

`GET /api/status` returns loading state, version and coverage. `GET /api/terms?q=tibia` finds ontology terms. `POST /api/query` accepts JSON:

```json
{"expression":"'part of' some 'insect leg'","direct":false,"builtins":false}
```

The response contains `subclasses`, `superclasses`, `equivalents`, `satisfiable`, and `elapsedMs`. Each class contains its IRI, compact identifier, label and definition. HTTP 400 denotes an invalid or unsupported query; HTTP 503 denotes a reasoner that is not ready.

## Data and attribution

The [AISM ontology](https://obofoundry.org/ontology/aism.html), by the AISM contributors, is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This repository preserves the original merged OWL bytes and annotations, including imported vocabulary attribution. The snapshot reports version **2026-02-14**, 8,614 classes and 31,886 logical axioms. See `data/provenance.json` for the retrieval source, date and checksum. This merged file has no external import declarations; no ontology imports are silently dropped.

[Whelk](https://github.com/INCATools/whelk) is BSD-3-Clause licensed. See Balhoff & Mungall, [Whelk: An OWL EL+RL Reasoner Enabling New Use Cases](https://doi.org/10.4230/TGDK.2.2.7). The [browser demonstration](https://github.com/balhoff/whelk-web) informed the architecture; this prototype uses the JVM OWL API integration. Dependency licenses remain with their authors. No dependency binaries or build caches need to be committed.
