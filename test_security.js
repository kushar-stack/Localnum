import assert from "node:assert/strict";
import { sanitizeBullet, sanitizeSummaryText, toSafeExternalUrl } from "./utils.js";
import subscribeHandler from "./api/subscribe.js";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function testUtils() {
  assert.equal(toSafeExternalUrl("https://example.com/story"), "https://example.com/story");
  assert.equal(toSafeExternalUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeBullet("<ul><li></li></ul>"), "");
  assert.equal(sanitizeSummaryText("A required part of this site couldnt load."), "");
}

async function testSubscribeOriginBlocking() {
  process.env.ALLOWED_ORIGINS = "https://busybrief.news";

  const req = {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: { email: "reader@example.com" },
    socket: { remoteAddress: "127.0.0.2" },
  };
  const res = createResponse();
  await subscribeHandler(req, res);
  assert.equal(res.statusCode, 403);
}

async function testSubscribeHoneypotAndMasking() {
  process.env.ALLOWED_ORIGINS = "https://busybrief.news";

  const req = {
    method: "POST",
    headers: { origin: "https://busybrief.news" },
    body: { email: "reader@example.com", company: "bot-filled" },
    socket: { remoteAddress: "127.0.0.3" },
  };
  const res = createResponse();
  await subscribeHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
}

await testUtils();
await testSubscribeOriginBlocking();
await testSubscribeHoneypotAndMasking();

console.log("Security regression checks passed.");
