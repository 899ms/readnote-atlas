// Browser-controlled Origin prevents web pages and unpaired extensions from
// retrieving the session. Never accept an ID supplied in a request body.
export function mayPair(headers, extensionIds) {
  return headers.host === '127.0.0.1:8792' &&
    extensionIds.some(id => headers.origin === `chrome-extension://${id}`);
}

export function authorized(headers, token, extensionIds) {
  return headers.host === '127.0.0.1:8792' &&
    (!headers.origin || mayPair(headers, extensionIds)) &&
    headers.authorization === `Bearer ${token}`;
}
