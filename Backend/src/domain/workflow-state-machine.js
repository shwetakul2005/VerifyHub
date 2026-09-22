const REQUEST_STATES = Object.freeze({
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    REJECTED: "rejected",
    CANCELLED: "cancelled"
});

const EXECUTION_STATES = Object.freeze({
    PENDING: "pending",
    WAITING_FOR_INPUT: "waiting_for_input",
    PROCESSING: "processing",
    WAITING_FOR_REVIEW: "waiting_for_review",
    FAILED: "failed",
    COMPLETED: "completed",
    SKIPPED: "skipped",
    CANCELLED: "cancelled"
});

const REQUEST_TRANSITIONS = Object.freeze({
    [REQUEST_STATES.PENDING]: Object.freeze([
        REQUEST_STATES.IN_PROGRESS,
        REQUEST_STATES.CANCELLED
    ]),
    [REQUEST_STATES.IN_PROGRESS]: Object.freeze([
        REQUEST_STATES.COMPLETED,
        REQUEST_STATES.REJECTED,
        REQUEST_STATES.CANCELLED
    ]),
    [REQUEST_STATES.COMPLETED]: Object.freeze([]),
    [REQUEST_STATES.REJECTED]: Object.freeze([]),
    [REQUEST_STATES.CANCELLED]: Object.freeze([])
});

const EXECUTION_TRANSITIONS = Object.freeze({
    [EXECUTION_STATES.PENDING]: Object.freeze([
        EXECUTION_STATES.WAITING_FOR_INPUT,
        EXECUTION_STATES.PROCESSING,
        EXECUTION_STATES.SKIPPED,
        EXECUTION_STATES.CANCELLED
    ]),
    [EXECUTION_STATES.WAITING_FOR_INPUT]: Object.freeze([
        EXECUTION_STATES.PROCESSING,
        EXECUTION_STATES.FAILED,
        EXECUTION_STATES.CANCELLED
    ]),
    [EXECUTION_STATES.PROCESSING]: Object.freeze([
        EXECUTION_STATES.WAITING_FOR_REVIEW,
        EXECUTION_STATES.COMPLETED,
        EXECUTION_STATES.FAILED,
        EXECUTION_STATES.CANCELLED
    ]),
    [EXECUTION_STATES.WAITING_FOR_REVIEW]: Object.freeze([
        EXECUTION_STATES.COMPLETED,
        EXECUTION_STATES.FAILED,
        EXECUTION_STATES.CANCELLED
    ]),
    [EXECUTION_STATES.FAILED]: Object.freeze([
        EXECUTION_STATES.PENDING,
        EXECUTION_STATES.CANCELLED
    ]),
    [EXECUTION_STATES.COMPLETED]: Object.freeze([]),
    [EXECUTION_STATES.SKIPPED]: Object.freeze([]),
    [EXECUTION_STATES.CANCELLED]: Object.freeze([])
});

const REQUEST_TERMINAL_STATES = new Set([
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED,
    REQUEST_STATES.CANCELLED
]);

const EXECUTION_TERMINAL_STATES = new Set([
    EXECUTION_STATES.COMPLETED,
    EXECUTION_STATES.SKIPPED,
    EXECUTION_STATES.CANCELLED
]);

const INVALID_TRANSITION_ERROR_CODE = "INVALID_WORKFLOW_TRANSITION";

class InvalidWorkflowTransitionError extends Error {
    constructor(entityType, fromState, toState) {
        super(`Cannot transition ${entityType} from "${fromState}" to "${toState}".`);
        this.name = "InvalidWorkflowTransitionError";
        this.code = INVALID_TRANSITION_ERROR_CODE;
        this.statusCode = 409;
        this.entityType = entityType;
        this.fromState = fromState;
        this.toState = toState;
    }
}

function canTransition(transitions, fromState, toState) {
    const allowedStates = transitions[fromState];
    return Array.isArray(allowedStates) && allowedStates.includes(toState);
}

function assertTransition(entityType, transitions, fromState, toState) {
    if (!canTransition(transitions, fromState, toState)) {
        throw new InvalidWorkflowTransitionError(entityType, fromState, toState);
    }
}

function canRequestTransition(fromState, toState) {
    return canTransition(REQUEST_TRANSITIONS, fromState, toState);
}

function canExecutionTransition(fromState, toState) {
    return canTransition(EXECUTION_TRANSITIONS, fromState, toState);
}

function assertRequestTransition(fromState, toState) {
    assertTransition("request", REQUEST_TRANSITIONS, fromState, toState);
}

function assertExecutionTransition(fromState, toState) {
    assertTransition("execution", EXECUTION_TRANSITIONS, fromState, toState);
}

function isRequestTerminal(state) {
    return REQUEST_TERMINAL_STATES.has(state);
}

function isExecutionTerminal(state) {
    return EXECUTION_TERMINAL_STATES.has(state);
}

module.exports = {
    REQUEST_STATES,
    EXECUTION_STATES,
    REQUEST_TRANSITIONS,
    EXECUTION_TRANSITIONS,
    INVALID_TRANSITION_ERROR_CODE,
    InvalidWorkflowTransitionError,
    canRequestTransition,
    canExecutionTransition,
    assertRequestTransition,
    assertExecutionTransition,
    isRequestTerminal,
    isExecutionTerminal
};
