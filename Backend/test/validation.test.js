const test = require("node:test");
const assert = require("node:assert/strict");

const {
    validateBody,
    schemas
} = require("../src/middlewares/validation.middleware");

function runMiddleware(middleware, body) {
    const req = { body };
    let response;
    let nextCalled = false;
    const res = {
        status(statusCode) {
            response = { statusCode };
            return this;
        },
        json(payload) {
            response.payload = payload;
            return this;
        }
    };

    middleware(req, res, () => {
        nextCalled = true;
    });

    return { req, response, nextCalled };
}

test("registration validation normalizes email and accepts a strong-enough password", () => {
    const result = runMiddleware(validateBody(schemas.register), {
        username: "  Applicant One  ",
        email: "APPLICANT@EXAMPLE.COM",
        password: "test-pass-123"
    });

    assert.equal(result.nextCalled, true);
    assert.equal(result.req.body.username, "Applicant One");
    assert.equal(result.req.body.email, "applicant@example.com");
});

test("workflow creation rejects client-controlled fields", () => {
    const result = runMiddleware(validateBody(schemas.workflowCreate), {
        name: "Identity workflow",
        organization: "64b64c1234567890abcdef12",
        assignedVerifier: "64b64c1234567890abcdef34",
        createdBy: "64b64c1234567890abcdef56"
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.response.statusCode, 400);
    assert.equal(result.response.payload.success, false);
});

test("MVP workflow validation rejects unimplemented step types", () => {
    const result = runMiddleware(validateBody(schemas.workflowStepCreate), {
        workflowTemplate: "64b64c1234567890abcdef12",
        stepOrder: 1,
        stepType: "police",
        title: "Police verification"
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.response.statusCode, 400);
});

test("workflow step validation retains a bounded retry override", () => {
    const draft = runMiddleware(validateBody(schemas.workflowStepCreate), {
        workflowTemplate: "64b64c1234567890abcdef12",
        stepOrder: 1,
        stepType: "email",
        title: "Verify email",
        maxRetries: 2
    });
    assert.equal(draft.nextCalled, true);
    assert.equal(draft.req.body.maxRetries, 2);

    const invalid = runMiddleware(validateBody(schemas.workflowStepUpdate), { maxRetries: -1 });
    assert.equal(invalid.nextCalled, false);
    assert.equal(invalid.response.statusCode, 400);
});

test("retry and cancellation commands require bounded identifiers and reasons", () => {
    const retry = runMiddleware(validateBody(schemas.workflowRetry), { idempotencyKey: "retry-123" });
    assert.equal(retry.nextCalled, true);
    const missingRetryKey = runMiddleware(validateBody(schemas.workflowRetry), {});
    assert.equal(missingRetryKey.response.statusCode, 400);
    const cancellation = runMiddleware(validateBody(schemas.workflowCancel), { reason: "Applicant withdrew" });
    assert.equal(cancellation.nextCalled, true);
    const blankReason = runMiddleware(validateBody(schemas.workflowCancel), { reason: " " });
    assert.equal(blankReason.response.statusCode, 400);
});
