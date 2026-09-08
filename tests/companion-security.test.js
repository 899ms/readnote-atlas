const test = require("node:test");
const assert = require("node:assert/strict");

test("companion rejects ordinary web origins and accepts its extension", async () => {
  const security = await import("../scripts/companion/companion-security.mjs");
  assert.equal(security.isAllowedBrowserOrigin("https://example.com"), false);
  assert.equal(
    security.isAllowedBrowserOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    true,
  );
  assert.equal(security.isAllowedBrowserOrigin("http://127.0.0.1:8791"), true);
  assert.equal(security.isAllowedBrowserOrigin(""), true);
});
