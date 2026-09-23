const crypto = require("crypto");
const mongoose = require("mongoose");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const VerificationDocument = require("../models/verification-document.model");
const AuditLog = require("../models/audit-log.model");
const { requireRequestAccess, requireDocumentReviewer, AccessError, idEquals } = require("./authorization.service");
const {
    REQUEST_STATES,
    EXECUTION_STATES,
    InvalidWorkflowTransitionError,
    assertRequestTransition,
    assertExecutionTransition,
    isRequestTerminal
} = require("../domain/workflow-state-machine");

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

class WorkflowCommandConflictError extends Error {
    constructor(message, code = "WORKFLOW_COMMAND_CONFLICT") {
        super(message);
        this.name = "WorkflowCommandConflictError";
        this.code = code;
        this.statusCode = 409;
    }
}

async function writeTransition(session, event) {
    await AuditLog.create([{
        organization: event.organization,
        action: event.action,
        actor: event.actor || undefined,
        actorType: event.actor ? "user" : "system",
        target: event.target,
        targetModel: event.targetModel,
        transition: {
            fromState: event.fromState,
            toState: event.toState,
            command: event.command,
            reason: event.reason,
            idempotencyKey: event.idempotencyKey
        }
    }], { session });
}

async function requireCommandAccess(actorId, requestId, roles, allowApplicant = false) {
    if (!actorId) return;
    await requireRequestAccess(actorId, requestId, {
        allowApplicant,
        organizationRoles: roles,
        requireAssignedVerifier: roles.includes("verifier")
    });
}

async function startVerification(requestId, actorId) {
    await requireCommandAccess(actorId, requestId, ["org_admin"]);
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const request = await VerificationRequest.findById(requestId).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status === REQUEST_STATES.IN_PROGRESS) {
                result = request;
                return;
            }
            if (isRequestTerminal(request.status)) {
                throw new InvalidWorkflowTransitionError("request", request.status, REQUEST_STATES.IN_PROGRESS);
            }
            assertRequestTransition(request.status, REQUEST_STATES.IN_PROGRESS);
            const firstExecution = await VerificationStepExecution.findOne({
                verificationRequest: request._id,
                status: EXECUTION_STATES.PENDING
            }).sort({ stepOrder: 1 }).session(session);
            if (!firstExecution) {
                throw new WorkflowCommandConflictError("Verification request has no pending execution to start.");
            }
            const now = new Date();
            const updated = await VerificationRequest.findOneAndUpdate(
                { _id: request._id, status: REQUEST_STATES.PENDING, stateVersion: request.stateVersion },
                {
                    $set: {
                        status: REQUEST_STATES.IN_PROGRESS,
                        currentExecution: firstExecution._id,
                        currentStep: firstExecution.workflowStep,
                        startedAt: now,
                        lastTransitionAt: now
                    },
                    $inc: { stateVersion: 1 }
                },
                { session, returnDocument: "after" }
            );
            if (!updated) throw new WorkflowCommandConflictError("Verification request changed while it was starting.");
            await writeTransition(session, {
                organization: updated.organization,
                action: "request_transition",
                actor: actorId,
                target: updated._id,
                targetModel: "VerificationRequest",
                fromState: REQUEST_STATES.PENDING,
                toState: REQUEST_STATES.IN_PROGRESS,
                command: "start"
            });
            result = updated;
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function claimExecution(requestId, executionId, actorId, options = {}) {
    await requireCommandAccess(actorId, requestId, ["org_admin", "verifier"], options.allowApplicant === true);
    const leaseMs = options.leaseMs || DEFAULT_LEASE_MS;
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const request = await VerificationRequest.findById(requestId).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status !== REQUEST_STATES.IN_PROGRESS) {
                throw new InvalidWorkflowTransitionError("request", request.status, REQUEST_STATES.IN_PROGRESS);
            }
            if (!idEquals(request.currentExecution, executionId)) {
                throw new WorkflowCommandConflictError("Only the request's current execution can run.", "EXECUTION_OUT_OF_SEQUENCE");
            }
            const execution = await VerificationStepExecution.findOne({
                _id: executionId,
                verificationRequest: request._id
            }).session(session);
            if (!execution) throw new AccessError("Verification execution not found.", 404);
            if (execution.status === EXECUTION_STATES.PROCESSING && execution.leaseExpiresAt > new Date()) {
                result = { claimed: false, request, execution };
                return;
            }
            if (execution.status === EXECUTION_STATES.WAITING_FOR_INPUT && options.allowWaitingForInput !== true) {
                result = { claimed: false, request, execution };
                return;
            }
            const targetStatus = execution.status === EXECUTION_STATES.PENDING && options.initialStatus
                ? options.initialStatus
                : EXECUTION_STATES.PROCESSING;
            const isExpiredReclaim = execution.status === EXECUTION_STATES.PROCESSING &&
                (!execution.leaseExpiresAt || execution.leaseExpiresAt <= new Date());
            if (!isExpiredReclaim) {
                assertExecutionTransition(execution.status, targetStatus);
            }
            const token = crypto.randomUUID();
            const now = new Date();
            const updated = await VerificationStepExecution.findOneAndUpdate(
                { _id: execution._id, status: execution.status, stateVersion: execution.stateVersion },
                {
                    $set: {
                        status: targetStatus,
                        processingToken: token,
                        leaseExpiresAt: new Date(now.getTime() + leaseMs),
                        startedAt: execution.startedAt || now
                    },
                    $inc: { stateVersion: 1, attempt: 1 }
                },
                { session, returnDocument: "after" }
            );
            if (!updated) throw new WorkflowCommandConflictError("Execution was claimed concurrently.");
            await writeTransition(session, {
                organization: request.organization,
                action: "execution_transition",
                actor: actorId,
                target: updated._id,
                targetModel: "VerificationStepExecution",
                fromState: execution.status,
                toState: targetStatus,
                command: isExpiredReclaim ? "reclaim" : "execute"
            });
            result = { claimed: true, request, execution: updated };
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function finalizeExecution({ requestId, executionId, processingToken, outcome, actorId = null }) {
    const targetStatus = outcome?.status;
    const allowedOutcomes = [EXECUTION_STATES.WAITING_FOR_INPUT, EXECUTION_STATES.WAITING_FOR_REVIEW,
        EXECUTION_STATES.COMPLETED, EXECUTION_STATES.FAILED];
    if (!allowedOutcomes.includes(targetStatus)) {
        throw new WorkflowCommandConflictError("Execution outcome status is invalid.", "INVALID_EXECUTION_OUTCOME");
    }
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const execution = await VerificationStepExecution.findOne({ _id: executionId, verificationRequest: requestId }).session(session);
            if (!execution) throw new AccessError("Verification execution not found.", 404);
            if (execution.status === targetStatus && execution.processingToken !== processingToken) {
                result = { idempotent: true, request: await VerificationRequest.findById(requestId).session(session), execution };
                return;
            }
            const request = await VerificationRequest.findById(requestId).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status !== REQUEST_STATES.IN_PROGRESS || !idEquals(request.currentExecution, execution._id)) {
                throw new WorkflowCommandConflictError("Late or out-of-sequence execution result was rejected.", "STALE_EXECUTION_RESULT");
            }
            if (execution.processingToken !== processingToken) {
                throw new WorkflowCommandConflictError("Execution claim is no longer valid.", "INVALID_PROCESSING_CLAIM");
            }
            const settlesSameStateClaim = execution.status === targetStatus;
            if (!settlesSameStateClaim) assertExecutionTransition(execution.status, targetStatus);
            const now = new Date();
            const set = {
                status: targetStatus,
                processingToken: null,
                leaseExpiresAt: null,
                metadata: { ...(execution.metadata || {}), ...(outcome.metadata || {}) }
            };
            if (targetStatus === EXECUTION_STATES.COMPLETED) set.completedAt = now;
            if (targetStatus === EXECUTION_STATES.FAILED) {
                set.lastError = outcome.error || { code: "EXECUTION_FAILED", message: "Execution failed.", retryable: true };
            }
            const updatedExecution = await VerificationStepExecution.findOneAndUpdate(
                { _id: execution._id, status: execution.status, processingToken, stateVersion: execution.stateVersion },
                { $set: set, $inc: { stateVersion: 1 } },
                { session, returnDocument: "after" }
            );
            if (!updatedExecution) throw new WorkflowCommandConflictError("Execution result was finalized concurrently.");
            if (!settlesSameStateClaim) {
                await writeTransition(session, {
                    organization: request.organization,
                    action: "execution_transition",
                    actor: actorId,
                    target: execution._id,
                    targetModel: "VerificationStepExecution",
                    fromState: execution.status,
                    toState: targetStatus,
                    command: "finalize"
                });
            }

            let updatedRequest = request;
            if (targetStatus === EXECUTION_STATES.COMPLETED) {
                const next = await VerificationStepExecution.findOne({
                    verificationRequest: request._id,
                    stepOrder: { $gt: execution.stepOrder },
                    status: EXECUTION_STATES.PENDING
                }).sort({ stepOrder: 1 }).session(session);
                if (next) {
                    updatedRequest = await VerificationRequest.findOneAndUpdate(
                        { _id: request._id, status: REQUEST_STATES.IN_PROGRESS, currentExecution: execution._id, stateVersion: request.stateVersion },
                        { $set: { currentExecution: next._id, currentStep: next.workflowStep, lastTransitionAt: now }, $inc: { stateVersion: 1 } },
                        { session, returnDocument: "after" }
                    );
                } else {
                    assertRequestTransition(request.status, REQUEST_STATES.COMPLETED);
                    updatedRequest = await VerificationRequest.findOneAndUpdate(
                        { _id: request._id, status: REQUEST_STATES.IN_PROGRESS, currentExecution: execution._id, stateVersion: request.stateVersion },
                        {
                            $set: {
                                status: REQUEST_STATES.COMPLETED,
                                currentExecution: null,
                                currentStep: null,
                                completedAt: now,
                                lastTransitionAt: now
                            },
                            $inc: { stateVersion: 1 }
                        },
                        { session, returnDocument: "after" }
                    );
                    await writeTransition(session, {
                        organization: request.organization,
                        action: "request_transition",
                        actor: actorId,
                        target: request._id,
                        targetModel: "VerificationRequest",
                        fromState: REQUEST_STATES.IN_PROGRESS,
                        toState: REQUEST_STATES.COMPLETED,
                        command: "complete"
                    });
                }
                if (!updatedRequest) throw new WorkflowCommandConflictError("Request advanced concurrently.");
            }
            result = { idempotent: false, request: updatedRequest, execution: updatedExecution };
        });
    } finally {
        await session.endSession();
    }
    return result;
}

function defaultAdapters() {
    return {
        email: require("./verification/emailVerification/email-verification.service"),
        document: require("./verification/documentVerification/document-verification.service"),
        face_verification: require("./verification/faceVerification/face-verification.service")
    };
}

async function executeCurrentStep(requestId, actorId, options = {}) {
    const request = await VerificationRequest.findById(requestId);
    if (!request) throw new AccessError("Verification request not found.", 404);
    if (!request.currentExecution) throw new WorkflowCommandConflictError("Request has no current execution.");
    const execution = await VerificationStepExecution.findById(request.currentExecution).lean();
    const inputFirstTypes = new Set(["email", "document", "face_verification"]);
    const claimOptions = { ...options };
    if (execution?.status === EXECUTION_STATES.PENDING && inputFirstTypes.has(execution.stepSnapshot?.stepType)) {
        claimOptions.initialStatus = EXECUTION_STATES.WAITING_FOR_INPUT;
    }
    const claim = await claimExecution(requestId, request.currentExecution, actorId, claimOptions);
    if (!claim.claimed) return claim;
    const stepType = claim.execution.stepSnapshot?.stepType;
    const adapter = (options.adapters || defaultAdapters())[stepType];
    if (!adapter?.execute) {
        await finalizeExecution({
            requestId,
            executionId: claim.execution._id,
            processingToken: claim.execution.processingToken,
            outcome: {
                status: EXECUTION_STATES.FAILED,
                error: { code: "UNSUPPORTED_STEP_TYPE", message: "No executor is available for this step type.", retryable: false }
            },
            actorId
        });
        throw new WorkflowCommandConflictError("No executor is available for this step type.", "UNSUPPORTED_STEP_TYPE");
    }
    let outcome;
    try {
        outcome = await adapter.execute({ request: claim.request, execution: claim.execution });
    } catch (error) {
        await finalizeExecution({
            requestId,
            executionId: claim.execution._id,
            processingToken: claim.execution.processingToken,
            outcome: {
                status: EXECUTION_STATES.FAILED,
                error: { code: "STEP_EXECUTION_FAILED", message: error.message, retryable: true }
            },
            actorId
        });
        const wrapped = new Error("Verification step execution failed.");
        wrapped.name = "WorkflowExecutionError";
        wrapped.code = "STEP_EXECUTION_FAILED";
        wrapped.statusCode = 502;
        throw wrapped;
    }
    const finalized = await finalizeExecution({
        requestId,
        executionId: claim.execution._id,
        processingToken: claim.execution.processingToken,
        outcome,
        actorId
    });
    return { claimed: true, outcome, ...finalized };
}

async function retryExecution(requestId, actorId, idempotencyKey) {
    if (!idempotencyKey?.trim()) {
        throw new WorkflowCommandConflictError("Retry requires an idempotency key.", "IDEMPOTENCY_KEY_REQUIRED");
    }
    await requireCommandAccess(actorId, requestId, ["org_admin", "verifier"], true);
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const request = await VerificationRequest.findById(requestId).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status !== REQUEST_STATES.IN_PROGRESS || !request.currentExecution) {
                throw new WorkflowCommandConflictError("Only the current execution of an active request can retry.");
            }
            const execution = await VerificationStepExecution.findById(request.currentExecution).session(session);
            if (!execution) throw new AccessError("Verification execution not found.", 404);
            if ((execution.attemptHistory || []).some((item) => item.idempotencyKey === idempotencyKey)) {
                result = execution;
                return;
            }
            if (execution.status !== EXECUTION_STATES.FAILED) {
                throw new WorkflowCommandConflictError("Only a failed execution can retry.");
            }
            if (execution.lastError?.retryable === false) {
                throw new WorkflowCommandConflictError("This execution failure is not retryable.", "EXECUTION_NOT_RETRYABLE");
            }
            if (execution.attempt > execution.maxRetries) {
                throw new WorkflowCommandConflictError("Execution retry budget is exhausted.", "RETRY_BUDGET_EXHAUSTED");
            }
            assertExecutionTransition(execution.status, EXECUTION_STATES.PENDING);
            const history = {
                attempt: execution.attempt,
                finishedAt: new Date(),
                errorCode: execution.lastError?.code,
                idempotencyKey
            };
            const updated = await VerificationStepExecution.findOneAndUpdate(
                { _id: execution._id, status: EXECUTION_STATES.FAILED, stateVersion: execution.stateVersion },
                {
                    $set: {
                        status: EXECUTION_STATES.PENDING,
                        lastError: null,
                        completedAt: null,
                        processingToken: null,
                        leaseExpiresAt: null
                    },
                    $push: { attemptHistory: history },
                    $inc: { stateVersion: 1 }
                },
                { session, returnDocument: "after" }
            );
            if (!updated) throw new WorkflowCommandConflictError("Execution retry was accepted concurrently.");
            await writeTransition(session, {
                organization: request.organization,
                action: "execution_transition",
                actor: actorId,
                target: execution._id,
                targetModel: "VerificationStepExecution",
                fromState: EXECUTION_STATES.FAILED,
                toState: EXECUTION_STATES.PENDING,
                command: "retry",
                idempotencyKey
            });
            result = updated;
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function cancelVerification(requestId, actorId, reason) {
    if (!reason?.trim()) {
        throw new WorkflowCommandConflictError("Cancellation requires a reason.", "CANCELLATION_REASON_REQUIRED");
    }
    await requireCommandAccess(actorId, requestId, ["org_admin"], true);
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const request = await VerificationRequest.findById(requestId).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status === REQUEST_STATES.CANCELLED) {
                result = request;
                return;
            }
            assertRequestTransition(request.status, REQUEST_STATES.CANCELLED);
            const cancellableStates = [
                EXECUTION_STATES.PENDING,
                EXECUTION_STATES.WAITING_FOR_INPUT,
                EXECUTION_STATES.PROCESSING,
                EXECUTION_STATES.WAITING_FOR_REVIEW,
                EXECUTION_STATES.FAILED
            ];
            const executions = await VerificationStepExecution.find({
                verificationRequest: request._id,
                status: { $in: cancellableStates }
            }).session(session);
            const now = new Date();
            for (const execution of executions) {
                assertExecutionTransition(execution.status, EXECUTION_STATES.CANCELLED);
                await VerificationStepExecution.updateOne(
                    { _id: execution._id, status: execution.status, stateVersion: execution.stateVersion },
                    {
                        $set: {
                            status: EXECUTION_STATES.CANCELLED,
                            cancelledAt: now,
                            cancelledBy: actorId,
                            cancellationReason: reason.trim(),
                            processingToken: null,
                            leaseExpiresAt: null
                        },
                        $inc: { stateVersion: 1 }
                    },
                    { session }
                );
                await writeTransition(session, {
                    organization: request.organization,
                    action: "execution_transition",
                    actor: actorId,
                    target: execution._id,
                    targetModel: "VerificationStepExecution",
                    fromState: execution.status,
                    toState: EXECUTION_STATES.CANCELLED,
                    command: "cancel",
                    reason: reason.trim()
                });
            }
            const updated = await VerificationRequest.findOneAndUpdate(
                { _id: request._id, status: request.status, stateVersion: request.stateVersion },
                {
                    $set: {
                        status: REQUEST_STATES.CANCELLED,
                        currentExecution: null,
                        currentStep: null,
                        cancelledAt: now,
                        cancelledBy: actorId,
                        cancellationReason: reason.trim(),
                        lastTransitionAt: now
                    },
                    $inc: { stateVersion: 1 }
                },
                { session, returnDocument: "after" }
            );
            if (!updated) throw new WorkflowCommandConflictError("Request was cancelled concurrently.");
            await writeTransition(session, {
                organization: request.organization,
                action: "request_transition",
                actor: actorId,
                target: request._id,
                targetModel: "VerificationRequest",
                fromState: request.status,
                toState: REQUEST_STATES.CANCELLED,
                command: "cancel",
                reason: reason.trim()
            });
            result = updated;
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function reviewDocument(documentId, actorId, decision, rejectionReason = null) {
    if (!["approved", "rejected"].includes(decision)) {
        throw new WorkflowCommandConflictError("Review decision is invalid.", "INVALID_REVIEW_DECISION");
    }
    if (decision === "rejected" && !rejectionReason?.trim()) {
        throw new WorkflowCommandConflictError("A rejection reason is required.", "REJECTION_REASON_REQUIRED");
    }
    await requireDocumentReviewer(actorId, documentId);
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const document = await VerificationDocument.findById(documentId).session(session);
            if (!document) throw new AccessError("Document not found.", 404);
            if (document.reviewStatus === decision) {
                result = document;
                return;
            }
            if (document.reviewStatus !== "pending") {
                throw new WorkflowCommandConflictError("Document already has a different review decision.", "REVIEW_DECISION_CONFLICT");
            }
            const request = await VerificationRequest.findById(document.verificationRequest).session(session);
            if (!request) throw new AccessError("Verification request not found.", 404);
            if (request.status !== REQUEST_STATES.IN_PROGRESS || !request.currentExecution) {
                throw new WorkflowCommandConflictError("The document's request is not awaiting review.");
            }
            const execution = await VerificationStepExecution.findOne({
                _id: request.currentExecution,
                verificationRequest: request._id,
                workflowStep: document.workflowStep
            }).session(session);
            if (!execution || execution.status !== EXECUTION_STATES.WAITING_FOR_REVIEW) {
                throw new WorkflowCommandConflictError("The document's execution is not awaiting review.");
            }
            const now = new Date();
            const updatedDocument = await VerificationDocument.findOneAndUpdate(
                { _id: document._id, reviewStatus: "pending" },
                {
                    $set: {
                        reviewStatus: decision,
                        reviewedBy: actorId,
                        reviewedAt: now,
                        rejectionReason: decision === "rejected" ? rejectionReason.trim() : null
                    }
                },
                { session, returnDocument: "after" }
            );
            if (!updatedDocument) throw new WorkflowCommandConflictError("Document was reviewed concurrently.");
            await writeTransition(session, {
                organization: request.organization,
                action: "review_decision",
                actor: actorId,
                target: document._id,
                targetModel: "VerificationDocument",
                fromState: "pending",
                toState: decision,
                command: decision === "approved" ? "approve" : "reject",
                reason: decision === "rejected" ? rejectionReason.trim() : undefined
            });

            const executionStatus = decision === "approved" ? EXECUTION_STATES.COMPLETED : EXECUTION_STATES.FAILED;
            assertExecutionTransition(execution.status, executionStatus);
            const executionSet = {
                status: executionStatus,
                processingToken: null,
                leaseExpiresAt: null,
                metadata: { ...(execution.metadata || {}), result: decision, verifiedBy: actorId }
            };
            if (decision === "approved") executionSet.completedAt = now;
            if (decision === "rejected") {
                executionSet.lastError = { code: "REVIEW_REJECTED", message: rejectionReason.trim(), retryable: false };
            }
            await VerificationStepExecution.updateOne(
                { _id: execution._id, status: EXECUTION_STATES.WAITING_FOR_REVIEW, stateVersion: execution.stateVersion },
                { $set: executionSet, $inc: { stateVersion: 1 } },
                { session }
            );
            await writeTransition(session, {
                organization: request.organization,
                action: "execution_transition",
                actor: actorId,
                target: execution._id,
                targetModel: "VerificationStepExecution",
                fromState: EXECUTION_STATES.WAITING_FOR_REVIEW,
                toState: executionStatus,
                command: decision === "approved" ? "approve" : "reject",
                reason: decision === "rejected" ? rejectionReason.trim() : undefined
            });

            if (decision === "approved") {
                const next = await VerificationStepExecution.findOne({
                    verificationRequest: request._id,
                    stepOrder: { $gt: execution.stepOrder },
                    status: EXECUTION_STATES.PENDING
                }).sort({ stepOrder: 1 }).session(session);
                if (next) {
                    await VerificationRequest.updateOne(
                        { _id: request._id, status: REQUEST_STATES.IN_PROGRESS, currentExecution: execution._id, stateVersion: request.stateVersion },
                        {
                            $set: { currentExecution: next._id, currentStep: next.workflowStep, lastTransitionAt: now },
                            $inc: { stateVersion: 1 }
                        },
                        { session }
                    );
                } else {
                    assertRequestTransition(request.status, REQUEST_STATES.COMPLETED);
                    await VerificationRequest.updateOne(
                        { _id: request._id, status: REQUEST_STATES.IN_PROGRESS, currentExecution: execution._id, stateVersion: request.stateVersion },
                        {
                            $set: { status: REQUEST_STATES.COMPLETED, currentExecution: null, currentStep: null, completedAt: now, lastTransitionAt: now },
                            $inc: { stateVersion: 1 }
                        },
                        { session }
                    );
                    await writeTransition(session, {
                        organization: request.organization,
                        action: "request_transition",
                        actor: actorId,
                        target: request._id,
                        targetModel: "VerificationRequest",
                        fromState: REQUEST_STATES.IN_PROGRESS,
                        toState: REQUEST_STATES.COMPLETED,
                        command: "complete"
                    });
                }
            } else {
                assertRequestTransition(request.status, REQUEST_STATES.REJECTED);
                const futureExecutions = await VerificationStepExecution.find({
                    verificationRequest: request._id,
                    _id: { $ne: execution._id },
                    status: { $in: [EXECUTION_STATES.PENDING, EXECUTION_STATES.WAITING_FOR_INPUT,
                        EXECUTION_STATES.PROCESSING, EXECUTION_STATES.WAITING_FOR_REVIEW, EXECUTION_STATES.FAILED] }
                }).session(session);
                for (const future of futureExecutions) {
                    assertExecutionTransition(future.status, EXECUTION_STATES.CANCELLED);
                    await VerificationStepExecution.updateOne(
                        { _id: future._id, status: future.status, stateVersion: future.stateVersion },
                        {
                            $set: { status: EXECUTION_STATES.CANCELLED, cancelledAt: now, cancelledBy: actorId, cancellationReason: "Request rejected" },
                            $inc: { stateVersion: 1 }
                        },
                        { session }
                    );
                    await writeTransition(session, {
                        organization: request.organization,
                        action: "execution_transition",
                        actor: actorId,
                        target: future._id,
                        targetModel: "VerificationStepExecution",
                        fromState: future.status,
                        toState: EXECUTION_STATES.CANCELLED,
                        command: "reject",
                        reason: rejectionReason.trim()
                    });
                }
                await VerificationRequest.updateOne(
                    { _id: request._id, status: REQUEST_STATES.IN_PROGRESS, currentExecution: execution._id, stateVersion: request.stateVersion },
                    {
                        $set: {
                            status: REQUEST_STATES.REJECTED,
                            currentExecution: null,
                            currentStep: null,
                            rejectedAt: now,
                            rejectedBy: actorId,
                            rejectionReason: rejectionReason.trim(),
                            lastTransitionAt: now
                        },
                        $inc: { stateVersion: 1 }
                    },
                    { session }
                );
                await writeTransition(session, {
                    organization: request.organization,
                    action: "request_transition",
                    actor: actorId,
                    target: request._id,
                    targetModel: "VerificationRequest",
                    fromState: REQUEST_STATES.IN_PROGRESS,
                    toState: REQUEST_STATES.REJECTED,
                    command: "reject",
                    reason: rejectionReason.trim()
                });
            }
            result = updatedDocument;
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function moveToNextStep() {
    throw new WorkflowCommandConflictError("Direct workflow advancement is disabled; finalize the current execution instead.");
}

async function completeVerification() {
    throw new WorkflowCommandConflictError("Direct workflow completion is disabled; finalize the current execution instead.");
}

module.exports = {
    WorkflowCommandConflictError,
    startVerification,
    claimExecution,
    finalizeExecution,
    executeCurrentStep,
    retryExecution,
    cancelVerification,
    reviewDocument,
    moveToNextStep,
    completeVerification
};
