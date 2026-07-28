import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  brotliCompress as brotliCompressCallback,
  constants as zlibConstants,
  gzip as gzipCallback,
} from "node:zlib";

const brotliCompress = promisify(brotliCompressCallback);
const gzip = promisify(gzipCallback);
const appDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(appDir, "dist");
const compressionCache = new Map();

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".webmanifest",
]);

const VERSIONED_ASSET_PATTERN =
  /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function cacheControlFor(pathname, isHtml) {
  if (isHtml || pathname === "/sw.js") {
    return "no-cache, no-store, must-revalidate";
  }
  if (VERSIONED_ASSET_PATTERN.test(pathname)) {
    return "public, max-age=31536000, s-maxage=31536000, immutable";
  }
  return "public, max-age=3600, must-revalidate";
}

function applySecurityHeaders(response) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
  );
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=()",
  );
}

function resolveRequestPath(pathname) {
  const relativePath = pathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distDir, relativePath);
  if (
    resolvedPath !== distDir &&
    !resolvedPath.startsWith(`${distDir}${path.sep}`)
  ) {
    return null;
  }
  return resolvedPath;
}

async function existingFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return { filePath, fileStat };
    }
    if (fileStat.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      const indexStat = await stat(indexPath);
      if (indexStat.isFile()) {
        return { filePath: indexPath, fileStat: indexStat };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function preferredEncoding(request, extension, size) {
  if (!COMPRESSIBLE_EXTENSIONS.has(extension) || size < 1024) {
    return "identity";
  }

  const accepted = request.headers["accept-encoding"] ?? "";
  if (accepted.includes("br")) return "br";
  if (accepted.includes("gzip")) return "gzip";
  return "identity";
}

async function compressedFile(filePath, encoding) {
  if (encoding === "identity") {
    return null;
  }

  const cacheKey = `${filePath}:${encoding}`;
  const cached = compressionCache.get(cacheKey);
  if (cached) return cached;

  const source = await readFile(filePath);
  const compressed =
    encoding === "br"
      ? await brotliCompress(source, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
          },
        })
      : await gzip(source, { level: 6 });

  compressionCache.set(cacheKey, compressed);
  return compressed;
}

async function serveFile(request, response, pathname, file, isHtml = false) {
  const extension = path.extname(file.filePath).toLowerCase();
  const contentType = MIME_TYPES.get(extension) ?? "application/octet-stream";
  const encoding = preferredEncoding(request, extension, file.fileStat.size);
  const etag = `W/"${file.fileStat.size.toString(16)}-${Math.trunc(
    file.fileStat.mtimeMs,
  ).toString(16)}-${encoding}"`;

  applySecurityHeaders(response);
  response.setHeader("Cache-Control", cacheControlFor(pathname, isHtml));
  response.setHeader("Content-Type", contentType);
  response.setHeader("ETag", etag);
  response.setHeader("Last-Modified", file.fileStat.mtime.toUTCString());

  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304);
    response.end();
    return;
  }

  const compressed = await compressedFile(file.filePath, encoding);
  if (compressed) {
    response.setHeader("Content-Encoding", encoding);
    response.setHeader("Content-Length", compressed.byteLength);
    response.setHeader("Vary", "Accept-Encoding");
  } else {
    response.setHeader("Content-Length", file.fileStat.size);
  }

  response.writeHead(200);
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  if (compressed) {
    response.end(compressed);
    return;
  }

  createReadStream(file.filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      response.writeHead(400);
      response.end("Bad Request");
      return;
    }

    if (pathname === "/favicon.ico") {
      response.writeHead(302, { Location: "/logo.png" });
      response.end();
      return;
    }

    const requestedPath = resolveRequestPath(
      pathname === "/" ? "/index.html" : pathname,
    );
    const requestedFile = requestedPath
      ? await existingFile(requestedPath)
      : null;

    if (requestedFile) {
      await serveFile(
        request,
        response,
        pathname,
        requestedFile,
        requestedFile.filePath.endsWith(".html"),
      );
      return;
    }

    const acceptsHtml = request.headers.accept?.includes("text/html");
    const isClientRoute = acceptsHtml && !path.extname(pathname);
    if (isClientRoute) {
      const indexFile = await existingFile(path.join(distDir, "index.html"));
      if (indexFile) {
        await serveFile(request, response, pathname, indexFile, true);
        return;
      }
    }

    applySecurityHeaders(response);
    response.writeHead(404, {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not Found");
  } catch (error) {
    console.error("Static server error", error);
    response.writeHead(500, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Internal Server Error");
  }
});

const host = readArgument("host") ?? process.env.HOST ?? "0.0.0.0";
const port = Number(readArgument("port") ?? process.env.PORT ?? 4173);

server.listen(port, host, () => {
  console.log(`PainelGRID frontend listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
