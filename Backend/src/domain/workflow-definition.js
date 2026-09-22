const SUPPORTED_STEP_TYPES = new Set(["email", "document", "face_verification"]);
const SUPPORTED_DOCUMENT_TYPES = new Set(["Aadhaar", "PAN"]);

class WorkflowDefinitionError extends Error {
    constructor(message, code = "WORKFLOW_DEFINITION_CONFLICT") {
        super(message);
        this.name = "WorkflowDefinitionError";
        this.code = code;
        this.statusCode = 409;
    }
}

function assertDraftWorkflow(workflow) {
    if (workflow.status !== "draft") {
        throw new WorkflowDefinitionError(
            "Published or archived workflow versions are immutable.",
            "WORKFLOW_VERSION_IMMUTABLE"
        );
    }
}

function validatePublishableSteps(steps) {
    const activeSteps = steps.filter((step) => step.status === "active" && !step.archivedAt);
    if (activeSteps.length === 0) {
        throw new WorkflowDefinitionError(
            "A workflow must contain at least one active step before publication.",
            "WORKFLOW_HAS_NO_ACTIVE_STEPS"
        );
    }

    const orders = new Set();
    for (const step of activeSteps) {
        if (!SUPPORTED_STEP_TYPES.has(step.stepType)) {
            throw new WorkflowDefinitionError(
                `The ${step.stepType} step type is unsupported for publication.`,
                "UNSUPPORTED_WORKFLOW_STEP"
            );
        }
        if (orders.has(step.stepOrder)) {
            throw new WorkflowDefinitionError(
                "Workflow steps must have unique order values.",
                "DUPLICATE_WORKFLOW_STEP_ORDER"
            );
        }
        orders.add(step.stepOrder);
        if (step.stepType === "document" &&
            !SUPPORTED_DOCUMENT_TYPES.has(step.config?.documentType)) {
            throw new WorkflowDefinitionError(
                "Document steps must select Aadhaar or PAN before publication.",
                "INVALID_DOCUMENT_STEP_CONFIG"
            );
        }
    }
    return activeSteps.sort((left, right) => left.stepOrder - right.stepOrder);
}

module.exports = {
    SUPPORTED_STEP_TYPES,
    WorkflowDefinitionError,
    assertDraftWorkflow,
    validatePublishableSteps
};
