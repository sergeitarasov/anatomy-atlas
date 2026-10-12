package org.anatomyatlas;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;

class QueryEngineTest {
    private static final String ONTOLOGY = """
      Prefix(:=<https://example.org/>)
      Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
      Ontology(
        Declaration(Class(:Leg)) Declaration(Class(:Tibia)) Declaration(Class(:Tarsus))
        Declaration(Class(:HindTibia)) Declaration(Class(:LegPart)) Declaration(Class(:Segment))
        Declaration(ObjectProperty(:part_of))
        AnnotationAssertion(rdfs:label :Leg "insect leg")
        AnnotationAssertion(rdfs:label :Tibia "tibia")
        AnnotationAssertion(rdfs:label :part_of "part of")
        SubClassOf(:Tibia ObjectSomeValuesFrom(:part_of :Leg))
        SubClassOf(:Tibia :Segment)
        SubClassOf(:HindTibia :Tibia)
        SubClassOf(:Tarsus ObjectSomeValuesFrom(:part_of :Leg))
        EquivalentClasses(:LegPart ObjectSomeValuesFrom(:part_of :Leg))
      )
      """;
    private QueryEngine engine() throws Exception {
        return new QueryEngine(OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(ONTOLOGY)));
    }
    @SuppressWarnings("unchecked")
    static Set<String> ids(Map<String,Object> response, String group) {
        Set<String> ids = new HashSet<>();
        ((List<Map<String,Object>>)response.get(group)).forEach(t -> ids.add((String)t.get("iri")));
        return ids;
    }
    @Test void infersAnonymousExpressionAndStrictHierarchy() throws Exception {
        try (var e = engine()) {
            var all = e.query("'part of' some 'insect leg'", false, false);
            assertEquals(Set.of("https://example.org/Tibia", "https://example.org/HindTibia", "https://example.org/Tarsus"), ids(all,"subclasses"));
            assertEquals(Set.of("https://example.org/LegPart"), ids(all,"equivalents"));
            var direct = e.query("'part of' some 'insect leg'", true, false);
            assertEquals(Set.of("https://example.org/Tibia", "https://example.org/Tarsus"), ids(direct,"subclasses"));
            assertEquals(ids(all,"imageMatches"), ids(direct,"imageMatches"));
            assertEquals(Set.of("https://example.org/Tibia", "https://example.org/HindTibia", "https://example.org/Tarsus", "https://example.org/LegPart"), ids(direct,"imageMatches"));
            assertEquals(Set.of("https://example.org/Tibia", "https://example.org/HindTibia"), ids(e.query("tibia",true,false),"imageMatches"));
            assertEquals(Set.of("https://example.org/Segment", "https://example.org/LegPart"), ids(e.query("tibia",true,false),"superclasses"));
        }
    }
    @Test void acceptsIriAndKeepsQueriesIsolated() throws Exception {
        try (var e = engine()) {
            var before = e.query("tibia",false,false);
            e.query("'part of' some ('part of' some 'insect leg')",false,false);
            var after = e.query("<https://example.org/Tibia>",false,false);
            for (String group : List.of("subclasses","superclasses","equivalents")) assertEquals(ids(before,group),ids(after,group));
            assertEquals(Set.of("https://example.org/Tibia"),ids(after,"equivalents"));
            assertEquals(Set.of("https://example.org/Tibia", "https://example.org/HindTibia"),ids(e.query("Segment and ('part of' some Leg)",false,false),"subclasses"));
        }
    }
    @Test void rejectsUnsupportedAndUnknownExpressions() throws Exception {
        try(var e = engine()) {
            assertThrows(RuntimeException.class, () -> e.query("unknown_anatomy",false,false));
            assertThrows(RuntimeException.class, () -> e.query("'part of' some",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("not tibia",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("tibia or Tarsus",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("tibia and",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("(tibia",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("tibia)",false,false));
            assertThrows(IllegalArgumentException.class, () -> e.query("'tibia",false,false));
        }
    }
    @Test void reportsContradictionEvenWithBuiltinsHidden() throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(ONTOLOGY.replace("SubClassOf(:Tibia :Segment)", "SubClassOf(:Tibia :Segment) DisjointClasses(:Tibia :Tarsus)")));
        try(var e = new QueryEngine(ontology)) {
            assertEquals(false,e.query("tibia and Tarsus",false,false).get("satisfiable"));
            assertTrue(ids(e.query("tibia and Tarsus",false,true),"imageMatches").isEmpty());
        }
    }
    @Test void termSearchAndDetailsPreserveBiologicalContext() throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(ONTOLOGY));
        var df = manager.getOWLDataFactory();
        manager.addAxiom(ontology, df.getOWLAnnotationAssertionAxiom(
            df.getOWLAnnotationProperty(org.semanticweb.owlapi.model.IRI.create("http://www.geneontology.org/formats/oboInOwl#hasExactSynonym")),
            org.semanticweb.owlapi.model.IRI.create("https://example.org/Tibia"), df.getOWLLiteral("shin segment")));
        try (var e = new QueryEngine(ontology)) {
            assertEquals("tibia", e.search("shin segment", "class").get(0).get("label"));
            assertTrue(e.search("shin segment", "property").isEmpty());
            assertEquals("'tibia'", e.search("tibia", "class").get(0).get("expression"));
            var detail = e.detail("https://example.org/Tibia");
            assertEquals("tibia", detail.get("label"));
            assertEquals(1, ((List<?>)detail.get("relationships")).size());
            assertEquals(2, ((List<?>)detail.get("parents")).size());
            assertEquals(1, ((List<?>)detail.get("children")).size());
            assertFalse(e.detail("https://example.org/part_of").containsKey("parents"));
            assertThrows(IllegalArgumentException.class, () -> e.detail("https://example.org/missing"));
        }
    }

}
