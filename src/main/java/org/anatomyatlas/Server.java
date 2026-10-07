package org.anatomyatlas;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Executors;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.FileDocumentSource;
import org.semanticweb.owlapi.model.*;

public final class Server {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static volatile QueryEngine engine;
    private static volatile String loadError;
    private static final Map<String, String> STATIC = Map.of("/", "index.html", "/app.js", "app.js", "/style.css", "style.css");
    public static void main(String[] args) throws Exception {
        Path file = Path.of(args.length > 0 ? args[0] : "data/aism.owl");
        int port = args.length > 1 ? Integer.parseInt(args[1]) : 8787;
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 16);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.createContext("/", Server::handle);
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { server.stop(0); if (engine != null) engine.close(); }));
        System.out.println("Anatomy Atlas: http://127.0.0.1:" + port + " (loading AISM)");
        Thread loader = new Thread(() -> {
            try {
                var manager = OWLManager.createOWLOntologyManager();
                var config = new OWLOntologyLoaderConfiguration().setMissingImportHandlingStrategy(MissingImportHandlingStrategy.THROW_EXCEPTION).setConnectionTimeout(15000);
                var ontology = manager.loadOntologyFromOntologyDocument(new FileDocumentSource(file.toFile()), config);
                engine = new QueryEngine(ontology);
                System.out.println("Ready: " + JSON.writeValueAsString(engine.status));
            } catch (Exception e) { loadError = e.getMessage(); e.printStackTrace(); }
        }, "ontology-loader");
        loader.start();
    }
    private static void handle(HttpExchange x) throws IOException {
        try {
            x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            x.getResponseHeaders().set("Cache-Control", "no-store");
            x.getResponseHeaders().set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
            String path = x.getRequestURI().getPath();
            String origin = x.getRequestHeaders().getFirst("Origin");
            String host = x.getRequestHeaders().getFirst("Host");
            if (host == null || !(host.equals("127.0.0.1:" + x.getLocalAddress().getPort()) || host.equals("localhost:" + x.getLocalAddress().getPort()))) { json(x, 403, Map.of("error", "Localhost requests only.")); return; }
            if (origin != null && !origin.equals("http://" + host)) { json(x, 403, Map.of("error", "Cross-origin requests are not allowed.")); return; }
            if (path.equals("/api/query")) {
                if (!x.getRequestMethod().equals("POST")) { json(x, 405, Map.of("error", "Use POST.")); return; }
                if (engine == null) { json(x, 503, Map.of("error", loadError == null ? "Ontology is still loading." : loadError)); return; }
                byte[] body = x.getRequestBody().readNBytes(16385);
                if (body.length > 16384) { json(x, 413, Map.of("error", "Request too large.")); return; }
                var request = JSON.readTree(body);
                if (request == null || !request.path("expression").isTextual()) throw new IllegalArgumentException("Provide a text expression.");
                json(x, 200, engine.query(request.path("expression").asText(), request.path("direct").asBoolean(false), request.path("builtins").asBoolean(false)));
            } else if (!x.getRequestMethod().equals("GET")) {
                json(x, 405, Map.of("error", "Use GET."));
            } else if (path.equals("/api/status")) {
                json(x, 200, engine != null ? engine.status : Map.of("state", loadError == null ? "loading" : "error", "message", loadError == null ? "Loading and classifying AISM…" : loadError));
            } else if (path.equals("/api/terms")) {
                String query = x.getRequestURI().getRawQuery();
                String search = query != null && query.startsWith("q=") ? URLDecoder.decode(query.substring(2), "UTF-8") : "";
                json(x, 200, engine == null ? List.of() : engine.search(search));
            } else if (STATIC.containsKey(path)) {
                String name = STATIC.get(path);
                try (InputStream stream = Server.class.getResourceAsStream("/web/" + name)) {
                    byte[] data = Objects.requireNonNull(stream).readAllBytes();
                    x.getResponseHeaders().set("Content-Type", name.endsWith(".js") ? "text/javascript; charset=utf-8" : name.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8");
                    x.sendResponseHeaders(200, data.length); x.getResponseBody().write(data);
                }
            } else json(x, 404, Map.of("error", "Not found."));
        } catch (IllegalArgumentException | org.semanticweb.owlapi.manchestersyntax.renderer.ParserException e) {
            json(x, 400, Map.of("error", e.getMessage() == null ? "Invalid expression." : e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace(); json(x, 500, Map.of("error", "Query failed: " + e.getClass().getSimpleName() + ". See the server log."));
        } finally { x.close(); }
    }
    private static void json(HttpExchange x, int status, Object body) throws IOException {
        byte[] bytes = JSON.writeValueAsBytes(body);
        x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        x.sendResponseHeaders(status, bytes.length); x.getResponseBody().write(bytes);
    }
}
