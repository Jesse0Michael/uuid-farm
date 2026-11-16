import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Serve the same generated reference in development and the Go static server.
// Keep it outside the main bundle so visiting the farm does not load ReDoc.
function apiReference(): Plugin {
  const files = [
    {
      path: "/reference/index.html",
      source: "../docs/index.html",
      type: "text/html; charset=utf-8",
    },
    {
      path: "/reference/openapi.yaml",
      source: "../api/openapi.yaml",
      type: "application/yaml; charset=utf-8",
    },
  ].map((file) => ({
    ...file,
    source: fileURLToPath(new URL(file.source, import.meta.url)),
  }));

  return {
    name: "farm-api-reference",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestedPath = request.url?.split("?", 1)[0];
        // Match the directory URL used by Go's static file server.
        const path = requestedPath === "/reference/"
          ? "/reference/index.html"
          : requestedPath;
        const file = files.find((entry) => entry.path === path);
        if (!file) return next();
        void readFile(file.source).then(
          (content) => {
            response.setHeader("Content-Type", file.type);
            response.end(content);
          },
          next,
        );
      });
    },
    async generateBundle() {
      for (const file of files) {
        this.emitFile({
          type: "asset",
          fileName: file.path.slice(1),
          source: await readFile(file.source),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [apiReference()],
  server: {
    proxy: { "/v1": "http://127.0.0.1:8080" },
  },
});
