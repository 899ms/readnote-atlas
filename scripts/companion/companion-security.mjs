export function isAllowedBrowserOrigin(origin) {
  if (!origin) return true;
  return /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin) ||
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

export function applyCorsForAllowedOrigin(request, response) {
  const origin = String(request.headers.origin || "");
  if (!origin || !isAllowedBrowserOrigin(origin)) return;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

export function hasAllowedBrowserOrigin(request) {
  return isAllowedBrowserOrigin(String(request.headers.origin || ""));
}
