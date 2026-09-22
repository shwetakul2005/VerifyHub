const test = require("node:test");
const assert = require("node:assert/strict");

const {
    InvalidWorkflowTransitionError,
    canRequestTransition,
    canExecutionTransition,
    assertRequestTransition,
    assertExecutionTransition,
    isRequestTerminal,
    isExecutionTerminal
} = require("../src/domain/workflow-state-machine");

const requestStates = [
    "pending",
    "in_progress",
    "completed",
    "rejected",
    "cancelled"
];

const validRequestTransitions = new Set([
    "pending->in_progress",
    "pending->cancelled",
    "in_progress->completed",
    "in_progress->rejected",
    "in_progress->cancelled"
]);

const executionStates = [
    "pending",
    "waiting_for_input",
    "processing",
    "waiting_for_review",
    "failed",
    "completed",
    "skipped",
    "cancelled"
];

const validExecutionTransitions = new Set([
    "pending->waiting_for_input",
    "pending->processing",
    "pending->skipped",
    "pending->cancelled",
    "waiting_for_input->processing",
    "waiting_for_input->failed",
    "waiting_for_input->cancelled",
    "processing->waiting_for_review",
    "processing->completed",
    "processing->failed",
    "processing->cancelled",
    "waiting_for_review->completed",
    "waiting_for_review->failed",
    "waiting_for_review->cancelled",
    "failed->pending",
    "failed->cancelled"
]);

function assertTransitionMatrix(states, validTransitions, canTransition, assertTransition) {
    for (const fromState of states) {
        for (const toState of states) {
            const transition = `${fromState}->${toState}`;
            const shouldBeAllowed = validTransitions.has(transition);

            assert.equal(
                canTransition(fromState, toState),
                shouldBeAllowed,
                `${transition} should ${shouldBeAllowed ? "be allowed" : "be rejected"}`
            );

            if (shouldBeAllowed) {
                assert.doesNotThrow(() => assertTransition(fromState, toState));
            } else {
                assert.throws(
                    () => assertTransition(fromState, toState),
                    InvalidWorkflowTransitionError
                );
            }
        }
    }
}

test("request transition rules accept every approved transition and reject every other state pair", () => {
    assertTransitionMatrix(
        requestStates,
        validRequestTransitions,
        canRequestTransition,
        assertRequestTransition
    );
});

test("execution transition rules accept every approved transition and reject every other state pair", () => {
    assertTransitionMatrix(
        executionStates,
        validExecutionTransitions,
        canExecutionTransition,
        assertExecutionTransition
    );
});

test("terminal-state helpers distinguish final states from retryable or active states", () => {
    const expectedRequestTerminalStates = new Set(["completed", "rejected", "cancelled"]);
    const expectedExecutionTerminalStates = new Set(["completed", "skipped", "cancelled"]);

    for (const state of requestStates) {
        assert.equal(isRequestTerminal(state), expectedRequestTerminalStates.has(state));
    }

    for (const state of executionStates) {
        assert.equal(isExecutionTerminal(state), expectedExecutionTerminalStates.has(state));
    }
});

test("invalid transitions expose a stable conflict error contract", () => {
    assert.throws(
        () => assertRequestTransition("completed", "pending"),
        (error) => {
            assert.equal(error.name, "InvalidWorkflowTransitionError");
            assert.equal(error.code, "INVALID_WORKFLOW_TRANSITION");
            assert.equal(error.statusCode, 409);
            assert.equal(error.entityType, "request");
            assert.equal(error.fromState, "completed");
            assert.equal(error.toState, "pending");
            return true;
        }
    );

    assert.throws(
        () => assertExecutionTransition("unknown", "processing"),
        (error) => {
            assert.equal(error.code, "INVALID_WORKFLOW_TRANSITION");
            assert.equal(error.statusCode, 409);
            assert.equal(error.entityType, "execution");
            assert.equal(error.fromState, "unknown");
            assert.equal(error.toState, "processing");
            return true;
        }
    );

    assert.equal(canRequestTransition("unknown", "pending"), false);
    assert.equal(canExecutionTransition("pending", "unknown"), false);
});
