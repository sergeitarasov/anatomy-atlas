package org.anatomyatlas;

import java.util.*;
import java.util.regex.*;

/** Validates the advertised fragment before OWL API parsing (which accepts some incomplete inputs). */
final class QuerySyntax {
    private static final Pattern TOKEN = Pattern.compile("\\s*(<[^<>\\s]+>|'(?:\\\\.|[^'\\\\])*'|[()]|[^\\s()'<>]+)");
    private final List<String> tokens = new ArrayList<>();
    private int at;
    static void validate(String input) {
        QuerySyntax syntax = new QuerySyntax();
        Matcher matcher = TOKEN.matcher(input);
        int end = 0;
        while (matcher.find()) {
            if (matcher.start() != end) throw new IllegalArgumentException("Invalid quoting or IRI near character " + (end+1));
            syntax.tokens.add(matcher.group(1)); end = matcher.end();
        }
        if (!input.substring(end).isBlank()) throw new IllegalArgumentException("Unclosed quote or IRI near character " + (end+1));
        syntax.conjunction();
        if (syntax.at != syntax.tokens.size()) throw new IllegalArgumentException("Unexpected token: " + syntax.peek() + ". Supported: named classes, and, some, parentheses.");
    }
    private String peek() { return at < tokens.size() ? tokens.get(at) : "<end of query>"; }
    private void conjunction() { primary(); while (peek().equals("and")) { at++; primary(); } }
    private void primary() {
        if (peek().equals("(")) {
            at++; conjunction();
            if (!peek().equals(")")) throw new IllegalArgumentException("Expected ')' before " + peek());
            at++; return;
        }
        if (Set.of("<end of query>",")","and","some","or","not","only","min","max","exactly","value","Self","inverse").contains(peek()))
            throw new IllegalArgumentException("Expected a class or property name, found " + peek() + ". Supported: named classes, and, some, parentheses.");
        at++;
        if (peek().equals("some")) { at++; primary(); }
    }
}
