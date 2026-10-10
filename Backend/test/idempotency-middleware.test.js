const test = require("node:test");
const assert = require("node:assert/strict");
const { requireIdempotencyKey } = require("../src/middlewares/idempotency.middleware");

test("idempotency middleware accepts and normalizes a bounded key", () => {
    const req = { get: () => "  upload-123  " };
    let called = false;
    requireIdempotencyKey(req, {}, () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.idempotencyKey, "upload-123");
});

test("idempotency middleware rejects absent and oversized keys", () => {
    for (const value of [undefined, "x".repeat(129)]) {
        let response;
        const res = { status(code) { response = { code }; return this; }, json(body) { response.body = body; return this; } };
        requireIdempotencyKey({ get: () => value }, res, () => assert.fail("next must not run"));
        assert.equal(response.code, 400);
        assert.equal(response.body.code, "IDEMPOTENCY_KEY_REQUIRED");
    }
});
