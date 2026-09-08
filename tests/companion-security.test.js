const test = require("node:test");
const assert = require("node:assert/strict");

test("companion rejects ordinary web origins and accepts its extension", async () => {
  const security = await import("../scripts/companion/companion-security.mjs");
  const companionOrigin = "http://127.0.0.1:8791";
  assert.equal(security.isAllowedBrowserOrigin("https://example.com", companionOrigin), false);
  assert.equal(
    security.isAllowedBrowserOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", companionOrigin),
    true,
  );
  assert.equal(security.isAllowedBrowserOrigin(companionOrigin, companionOrigin), true);
  assert.equal(security.isAllowedBrowserOrigin("http://127.0.0.1:3000", companionOrigin), false);
  assert.equal(security.isAllowedBrowserOrigin("http://localhost:8791", companionOrigin), false);
  assert.equal(security.isAllowedBrowserOrigin("", companionOrigin), true);
});
