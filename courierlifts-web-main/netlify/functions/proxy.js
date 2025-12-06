// Netlify Function: proxies /api/* → Render backend
// Uses BACKEND_URL env var, falls back to your Render URL.
const UPSTREAM = process.env.BACKEND_URL || "https://cl-backend-ppv1.onrender.com";

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
    };
  }

  // Build target URL (strip function prefix + /api)
  const stripPrefix = (p) =>
    p.replace(/^\/\.netlify\/functions\/proxy/, "").replace(/^\/api/, "") || "/";
  const qs = event.rawQuery ? `?${event.rawQuery}` : "";
  const target = `${UPSTREAM}${stripPrefix(event.path)}${qs}`;

  // Forward headers/body
  const headers = { ...event.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];

  let body = event.body;
  if (event.isBase64Encoded && body) body = Buffer.from(body, "base64");

  try {
    const res = await fetch(target, {
      method: event.httpMethod,
      headers,
      body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : body,
    });

    // Copy response headers
    const outHeaders = {};
    res.headers.forEach((v, k) => (outHeaders[k] = v));
    // CORS (open; restrict to your domain later if you want)
    outHeaders["access-control-allow-origin"] = "*";
    outHeaders["access-control-allow-credentials"] = "true";

    const buf = Buffer.from(await res.arrayBuffer());
    const isBinary =
      (outHeaders["content-type"] || "").startsWith("application/octet-stream");

    return {
      statusCode: res.status,
      headers: outHeaders,
      body: buf.toString(isBinary ? "base64" : "utf8"),
      isBase64Encoded: !!isBinary,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ error: "proxy_upstream_error", message: String(err) }),
    };
  }
};
