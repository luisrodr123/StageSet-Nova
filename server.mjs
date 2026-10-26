import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative as relativePath, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

export function createStageSetServer({ directory = root } = {}) {
  return createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    if (pathname.startsWith("/api/stemdeck/")) {
      const allowedPath = /^\/api\/stemdeck\/(?:health|jobs(?:\/[a-f0-9-]+(?:\/cancel|\/stems\/(?:vocals|drums|bass|guitar|piano|other)\.wav)?)?)$/i.test(pathname);
      const allowedMethod = request.method === "GET" || request.method === "POST";
      if (!allowedPath || !allowedMethod) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ detail: "Rota StemDeck não suportada." }));
        return;
      }
      const stemDeckPath = pathname.replace("/api/stemdeck", "/api") + new URL(request.url, "http://localhost").search;
      const upstream = httpRequest({
        hostname: "127.0.0.1",
        port: 8765,
        path: stemDeckPath,
        method: request.method,
        headers: {
          "content-type": request.headers["content-type"],
          accept: request.headers.accept ?? "*/*",
          origin: "http://127.0.0.1:8765",
        },
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, {
          "Content-Type": upstreamResponse.headers["content-type"] ?? "application/octet-stream",
          ...(upstreamResponse.headers["cache-control"] ? { "Cache-Control": upstreamResponse.headers["cache-control"] } : {}),
        });
        upstreamResponse.pipe(response);
      });
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ detail: "StemDeck não está disponível em 127.0.0.1:8765." }));
      });
      request.pipe(upstream);
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = resolve(directory, relative);
    const relativeFile = relativePath(directory, file);

    if (relativeFile === ".." || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const content = await readFile(file);
      response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(root, "server.mjs")) {
  createStageSetServer().listen(4177, "127.0.0.1", () => {
    process.stdout.write("StageSet is ready at http://127.0.0.1:4177\n");
  });
}
