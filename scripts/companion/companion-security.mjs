export function isAllowedBrowserOrigin(origin, companionOrigin) {
  if (!origin) return true;
  return origin === companionOrigin ||
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

export function applyCorsForAllowedOrigin(request, response, companionOrigin) {
  const origin = String(request.headers.origin || "");
  if (!origin || !isAllowedBrowserOrigin(origin, companionOrigin)) return;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

export function hasAllowedBrowserOrigin(request, companionOrigin) {
  return isAllowedBrowserOrigin(String(request.headers.origin || ""), companionOrigin);
}
