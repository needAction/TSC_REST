import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>방탈출 서버 API 문서</title><link rel="stylesheet" href="/swagger/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/swagger/swagger-ui-bundle.js"></script>
<script src="/swagger/swagger-initializer.js"></script></body></html>`;
const initializer = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true,
    docExpansion: 'list', defaultModelsExpandDepth: 1, displayOperationId: true, filter: true,
    supportedSubmitMethods: [], tryItOutEnabled: false, persistAuthorization: false,
    validatorUrl: null, queryConfigEnabled: false, syntaxHighlight: { activated: false }
  });
};`;

// 고정된 문서 자원만 제공하는 HTTP Adapter입니다. 임의 파일 경로나 외부 CDN을 사용하지 않습니다.
export class SwaggerUiHttpHandler {
  private readonly assets = new Map<string, { contentType: string; body: string | Buffer }>([
    ["/swagger/", { contentType: "text/html; charset=utf-8", body: html }],
    ["/swagger/swagger-initializer.js", { contentType: "application/javascript; charset=utf-8", body: initializer }]
  ]);
  handle(method: string | undefined, pathname: string, response: ServerResponse): boolean {
    if (method !== "GET") return false;
    if (pathname === "/swagger") {
      response.writeHead(302, { Location: "/swagger/", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    if (pathname === "/swagger/swagger-ui.css" || pathname === "/swagger/swagger-ui-bundle.js") {
      if (!this.assets.has(pathname)) {
        const name = pathname.endsWith(".css") ? "swagger-ui.css" : "swagger-ui-bundle.js";
        this.assets.set(pathname, { contentType: name.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8",
          body: readFileSync(require.resolve("swagger-ui-dist/" + name)) });
      }
    }
    const asset = this.assets.get(pathname);
    if (!asset) return false;
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    response.writeHead(200);
    response.end(asset.body);
    return true;
  }
}
