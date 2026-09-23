const test = require("node:test");
const assert = require("node:assert/strict");

const workflowEngineService = require("../src/services/workflow-engine.service");
const controller = require("../src/controllers/workflow-engine.controller");

function responseRecorder() {
    return {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test("workflow command conflicts preserve their HTTP status and stable error code", async () => {
    const original = workflowEngineService.startVerification;
    workflowEngineService.startVerification = async () => {
        const error = new Error("Terminal requests cannot restart.");
        error.statusCode = 409;
        error.code = "INVALID_WORKFLOW_TRANSITION";
        throw error;
    };
    const response = responseRecorder();
    try {
        await controller.startVerificationController(
            { params: { requestId: "request-id" }, user: { id: "actor-id" } },
            response
        );
    } finally {
        workflowEngineService.startVerification = original;
    }
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "INVALID_WORKFLOW_TRANSITION");
});
