const { createServer } = require("node:http");
const { once } = require("node:events");

const HOST = "127.0.0.1";

async function listenLoopback(port, handler) {
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, handler);
  server.listen({ host: HOST, port, exclusive: true });
  await once(server, "listening");
  return server;
}

function requestUrl(request, origin) {
  if (request.headers.host !== new URL(origin).host || !request.url?.startsWith("/")) {
    return null;
  }
  try {
    const url = new URL(request.url, origin);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

function reply(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

module.exports = { HOST, listenLoopback, reply, requestUrl };
