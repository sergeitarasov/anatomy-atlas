package org.anatomyatlas;

import java.util.*;
import java.util.stream.Collectors;
import org.geneontology.whelk.Bridge;
import org.geneontology.whelk.owlapi.WhelkOWLReasonerFactory;
import org.semanticweb.owlapi.manchestersyntax.parser.ManchesterOWLSyntaxParserImpl;
import org.semanticweb.owlapi.expression.OWLEntityChecker;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.Imports;
import org.semanticweb.owlapi.reasoner.OWLReasoner;
import org.semanticweb.owlapi.util.mansyntax.ManchesterOWLSyntaxParser;

/** OWL API parser + actual Whelk classification. No graph-traversal approximation. */
public final class QueryEngine implements AutoCloseable {
    private final OWLOntology ontology;
    private final OWLReasoner reasoner;
    private final Map<String, Set<OWLEntity>> names = new HashMap<>();
    private final Map<IRI, String> labels = new HashMap<>();
    private final Map<IRI, String> definitions = new HashMap<>();
    private final List<Map<String, Object>> terms;
    public final Map<String, Object> status;

    public QueryEngine(OWLOntology ontology) {
        this.ontology = ontology;
        long start = System.nanoTime();
        var df = ontology.getOWLOntologyManager().getOWLDataFactory();
        Set<OWLEntity> entities = new HashSet<>(ontology.getSignature(Imports.INCLUDED));
        entities.add(df.getOWLThing()); entities.add(df.getOWLNothing());
        Map<IRI, List<OWLEntity>> byIri = entities.stream().collect(Collectors.groupingBy(OWLEntity::getIRI));
        for (OWLOntology o : ontology.getImportsClosure()) {
            for (OWLAnnotationAssertionAxiom a : o.getAxioms(AxiomType.ANNOTATION_ASSERTION)) {
                if (!(a.getSubject() instanceof IRI iri) || !(a.getValue() instanceof OWLLiteral literal)) continue;
                if (a.getProperty().isLabel()) {
                    for (OWLEntity entity : byIri.getOrDefault(iri, List.of())) addName(literal.getLiteral(), entity);
                    if (!labels.containsKey(iri) || literal.hasLang("en")) labels.put(iri, literal.getLiteral());
                }
                if (a.getProperty().getIRI().toString().endsWith("IAO_0000115")) definitions.put(iri, literal.getLiteral());
            }
        }
        for (OWLEntity e : entities) {
            String iri = e.getIRI().toString();
            addName(iri, e); addName("<" + iri + ">", e); addName(e.getIRI().getShortForm(), e);
            if (iri.startsWith("http://purl.obolibrary.org/obo/")) addName(e.getIRI().getShortForm().replaceFirst("_", ":"), e);
        }
        addName("owl:Thing", df.getOWLThing()); addName("owl:Nothing", df.getOWLNothing());
        // Convenience alias; ontology labels and identifiers are otherwise preserved exactly.
        entities.stream().filter(e -> e.getIRI().toString().equals("http://purl.obolibrary.org/obo/BFO_0000050")).forEach(e -> addName("part_of", e));
        terms = entities.stream().filter(e -> e.isOWLClass() || e.isOWLObjectProperty()).map(this::term)
            .sorted(Comparator.comparing(t -> (String)t.get("label"), String.CASE_INSENSITIVE_ORDER)).collect(Collectors.toList());
        Map<String, Integer> unconverted = new TreeMap<>();
        int unsupportedExpressions = 0;
        for (OWLAxiom a : ontology.getLogicalAxioms(Imports.INCLUDED)) {
            if (Bridge.convertAxiom(a).isEmpty()) unconverted.merge(a.getAxiomType().getName(), 1, Integer::sum);
            if (a.getNestedClassExpressions().stream().anyMatch(e -> Bridge.convertExpression(e).isEmpty())) unsupportedExpressions++;
        }
        reasoner = new WhelkOWLReasonerFactory().createReasoner(ontology);
        status = new LinkedHashMap<>();
        status.put("state", "ready"); status.put("reasoner", "Whelk 1.2.1");
        status.put("ontology", ontology.getOntologyID().getOntologyIRI().isPresent() ? ontology.getOntologyID().getOntologyIRI().get().toString() : "anonymous");
        status.put("version", ontology.getOntologyID().getVersionIRI().isPresent() ? ontology.getOntologyID().getVersionIRI().get().toString() : "unversioned");
        status.put("classes", ontology.getClassesInSignature(Imports.INCLUDED).size());
        status.put("logicalAxioms", ontology.getLogicalAxiomCount(Imports.INCLUDED));
        status.put("unconvertedLogicalAxioms", unconverted);
        status.put("axiomsWithUnconvertedExpressions", unsupportedExpressions);
        status.put("unsatisfiableClasses", reasoner.getUnsatisfiableClasses().getEntitiesMinusBottom().size());
        status.put("initializationMs", (System.nanoTime() - start) / 1_000_000);
    }

    private void addName(String key, OWLEntity entity) {
        if (entity != null) names.computeIfAbsent(key, k -> new HashSet<>()).add(entity);
    }
    private <T extends OWLEntity> T resolve(String input, Class<T> type) {
        String key = input;
        if (key.startsWith("'") && key.endsWith("'")) key = key.substring(1, key.length()-1).replace("\\'", "'").replace("\\\\", "\\");
        var matches = names.getOrDefault(key, Set.of()).stream().filter(type::isInstance).map(type::cast).toList();
        if (matches.size() > 1) throw new IllegalArgumentException("Ambiguous label '" + key + "'. Use an identifier: " + matches.stream().map(e -> e.getIRI().toString()).collect(Collectors.joining(", ")));
        return matches.isEmpty() ? null : matches.get(0);
    }
    private OWLEntityChecker checker() {
        return new OWLEntityChecker() {
            public OWLClass getOWLClass(String n) { return resolve(n, OWLClass.class); }
            public OWLObjectProperty getOWLObjectProperty(String n) { return resolve(n, OWLObjectProperty.class); }
            public OWLDataProperty getOWLDataProperty(String n) { return resolve(n, OWLDataProperty.class); }
            public OWLNamedIndividual getOWLIndividual(String n) { return resolve(n, OWLNamedIndividual.class); }
            public OWLDatatype getOWLDatatype(String n) { return resolve(n, OWLDatatype.class); }
            public OWLAnnotationProperty getOWLAnnotationProperty(String n) { return resolve(n, OWLAnnotationProperty.class); }
        };
    }
    public Map<String, Object> term(OWLEntity entity) {
        String iri = entity.getIRI().toString(), label = labels.getOrDefault(entity.getIRI(), entity.getIRI().getShortForm());
        return Map.of("iri", iri, "id", entity.getIRI().getShortForm().replaceFirst("_", ":"), "label", label,
            "kind", entity.isOWLClass() ? "class" : "property", "definition", definitions.getOrDefault(entity.getIRI(), ""),
            "query", "<" + iri + ">");
    }
    public List<Map<String, Object>> search(String text) {
        String q = text.toLowerCase(Locale.ROOT);
        return terms.stream().filter(t -> (t.get("label") + " " + t.get("id")).toLowerCase(Locale.ROOT).contains(q)).limit(50).toList();
    }
    private List<Map<String, Object>> results(Set<OWLClass> classes, boolean builtins) {
        return classes.stream().filter(c -> builtins || (!c.isOWLThing() && !c.isOWLNothing())).map(this::term)
            .sorted(Comparator.comparing(t -> (String)t.get("label"), String.CASE_INSENSITIVE_ORDER)).toList();
    }
    public synchronized Map<String, Object> query(String expression, boolean direct, boolean builtins) {
        if (expression == null || expression.isBlank()) throw new IllegalArgumentException("Enter a Manchester class expression.");
        if (expression.length() > 4000) throw new IllegalArgumentException("Query is too long (maximum 4,000 characters).");
        QuerySyntax.validate(expression);
        long start = System.nanoTime();
        ManchesterOWLSyntaxParser parser = new ManchesterOWLSyntaxParserImpl(OWLOntologyLoaderConfiguration::new, ontology.getOWLOntologyManager().getOWLDataFactory());
        parser.setDefaultOntology(ontology); parser.setOWLEntityChecker(checker()); parser.setStringToParse(expression);
        OWLClassExpression parsed = parser.parseClassExpression();
        // Restrict the query grammar to a reliable EL fragment. Do not silently give incomplete full-DL answers.
        for (OWLClassExpression e : parsed.getNestedClassExpressions()) {
            if (!(e instanceof OWLClass || e instanceof OWLObjectIntersectionOf || e instanceof OWLObjectSomeValuesFrom))
                throw new IllegalArgumentException("This prototype supports named classes, 'and', 'some', and parentheses. This query uses " + e.getClassExpressionType() + ", which is outside the supported query fragment.");
            if (e instanceof OWLObjectSomeValuesFrom some && some.getProperty().isAnonymous())
                throw new IllegalArgumentException("Inverse property expressions are not supported in prototype queries.");
        }
        Set<OWLClass> equivalents = new HashSet<>(reasoner.getEquivalentClasses(parsed).getEntities());
        // Whelk's OWL API adapter excludes a named query itself; OWL API/Protégé equivalent nodes include it.
        if (!parsed.isAnonymous()) equivalents.add(parsed.asOWLClass());
        boolean satisfiable = !equivalents.contains(ontology.getOWLOntologyManager().getOWLDataFactory().getOWLNothing());
        var result = new LinkedHashMap<String, Object>();
        result.put("expression", expression); result.put("normalized", parsed.toString()); result.put("direct", direct);
        result.put("subclasses", results(reasoner.getSubClasses(parsed, direct).getFlattened(), builtins));
        result.put("superclasses", results(reasoner.getSuperClasses(parsed, direct).getFlattened(), builtins));
        result.put("equivalents", results(equivalents, builtins)); result.put("satisfiable", satisfiable);
        result.put("elapsedMs", (System.nanoTime() - start) / 1_000_000);
        return result;
    }
    public void close() { reasoner.dispose(); }
}
