const mongoose = require("mongoose");
const WorkflowTemplate = require("../models/workflow-template.model");
const WorkflowStep = require("../models/workflow-step.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationStepExecution = require("../models/verification-step-execution.model");
const VerificationDocument = require("../models/verification-document.model");

const key = (value) => String(value);

function groupBy(items, getKey) {
    const groups = new Map();
    for (const item of items) {
        const groupKey = getKey(item);
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(item);
    }
    return groups;
}

function isPristinePending(execution) {
    return execution.status === "pending" &&
        !execution.startedAt && !execution.completedAt &&
        Object.keys(execution.metadata || {}).length === 0;
}

function mapLegacyExecution(execution, step, documents) {
    if (execution.status !== "in_progress") return execution.status;
    const metadata = execution.metadata || {};

    if (step.stepType === "email") {
        return metadata.token && metadata.expiresAt && new Date(metadata.expiresAt) > new Date()
            ? "waiting_for_input"
            : null;
    }
    if (step.stepType === "document") {
        const matching = documents.filter((document) =>
            key(document.verificationRequest) === key(execution.verificationRequest) &&
            key(document.workflowStep) === key(execution.workflowStep)
        );
        if (matching.length === 0) return "waiting_for_input";
        return matching.every((document) => Boolean(document.metadata?.ocr))
            ? "waiting_for_review"
            : null;
    }
    if (step.stepType === "face_verification" &&
        !metadata.documentFilePath && !metadata.liveFilePath) {
        return "waiting_for_input";
    }
    return null;
}

async function loadWorkflowData() {
    const [workflows, steps, requests, executions, documents] = await Promise.all([
        WorkflowTemplate.find().lean(),
        WorkflowStep.find().lean(),
        VerificationRequest.find().lean(),
        VerificationStepExecution.find().lean(),
        VerificationDocument.find().lean()
    ]);
    return { workflows, steps, requests, executions, documents };
}

function analyzeWorkflowData(data) {
    const violations = [];
    const safeDuplicateGroups = [];
    const workflows = new Map(data.workflows.map((workflow) => [key(workflow._id), workflow]));
    const steps = new Map(data.steps.map((step) => [key(step._id), step]));
    const requests = new Map(data.requests.map((request) => [key(request._id), request]));
    const stepsByWorkflow = groupBy(data.steps, (step) => key(step.workflowTemplate));
    const executionsByRequest = groupBy(data.executions, (execution) => key(execution.verificationRequest));
    const executionGroups = groupBy(data.executions, (execution) =>
        `${key(execution.verificationRequest)}:${key(execution.workflowStep)}`
    );

    const versionedWorkflows = data.workflows.filter((workflow) => workflow.familyId);
    for (const matches of groupBy(versionedWorkflows, (workflow) =>
        `${key(workflow.organization)}:${key(workflow.familyId)}:${workflow.version}`
    ).values()) {
        if (matches.length > 1) {
            violations.push({
                code: "DUPLICATE_WORKFLOW_VERSION",
                organizationId: key(matches[0].organization),
                familyId: key(matches[0].familyId),
                version: matches[0].version,
                workflowIds: matches.map((workflow) => key(workflow._id))
            });
        }
    }

    for (const [workflowId, workflowSteps] of stepsByWorkflow) {
        if (!workflows.has(workflowId)) {
            violations.push({ code: "ORPHAN_STEP", workflowId });
        }
        for (const [order, matches] of groupBy(workflowSteps, (step) => key(step.stepOrder))) {
            if (matches.length > 1) {
                violations.push({ code: "DUPLICATE_STEP_ORDER", workflowId, stepOrder: Number(order), stepIds: matches.map((step) => key(step._id)) });
            }
        }
    }

    for (const request of data.requests) {
        const requestId = key(request._id);
        const workflow = workflows.get(key(request.workflowTemplate));
        if (!workflow) {
            violations.push({ code: "ORPHAN_REQUEST_WORKFLOW", requestId });
            continue;
        }
        if (workflow.status !== "published" && !request.workflowSnapshot?.steps?.length) {
            violations.push({ code: "DRAFT_WORKFLOW_REFERENCE", requestId, workflowId: key(workflow._id) });
        }
        const snapshotSteps = request.workflowSnapshot?.steps?.length
            ? request.workflowSnapshot.steps
            : (stepsByWorkflow.get(key(workflow._id)) || []).filter((step) => step.status === "active" && !step.archivedAt);
        if (snapshotSteps.length === 0) {
            violations.push({ code: "EMPTY_WORKFLOW", requestId });
        }
        const stepIds = new Set(snapshotSteps.map((step) => key(step.workflowStep || step._id)));
        if (request.currentStep && !stepIds.has(key(request.currentStep))) {
            violations.push({ code: "INVALID_CURRENT_STEP", requestId });
        }
        if (request.status === "in_progress" && !request.currentStep) {
            violations.push({ code: "AMBIGUOUS_REQUEST_STATE", requestId });
        }
        const requestExecutions = executionsByRequest.get(requestId) || [];
        if (request.status === "in_progress" && request.currentStep &&
            !requestExecutions.some((execution) => key(execution.workflowStep) === key(request.currentStep))) {
            violations.push({ code: "MISSING_CURRENT_EXECUTION", requestId });
        }
        if (["completed", "rejected", "cancelled"].includes(request.status) &&
            snapshotSteps.some((step) => !requestExecutions.some((execution) =>
                key(execution.workflowStep) === key(step.workflowStep || step._id)))) {
            violations.push({ code: "AMBIGUOUS_TERMINAL_HISTORY", requestId });
        }
        for (const execution of requestExecutions) {
            if (!stepIds.has(key(execution.workflowStep))) {
                violations.push({ code: "EXECUTION_OUTSIDE_SNAPSHOT", requestId, executionId: key(execution._id) });
            }
        }
    }

    for (const execution of data.executions) {
        const executionId = key(execution._id);
        const request = requests.get(key(execution.verificationRequest));
        const step = steps.get(key(execution.workflowStep));
        if (!request || !step) {
            violations.push({ code: "ORPHAN_EXECUTION", executionId });
            continue;
        }
        if (execution.status === "in_progress" &&
            !mapLegacyExecution(execution, step, data.documents)) {
            violations.push({ code: "AMBIGUOUS_EXECUTION_STATE", executionId });
        }
    }

    for (const group of executionGroups.values()) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((left, right) =>
            new Date(left.createdAt || 0) - new Date(right.createdAt || 0) ||
            key(left._id).localeCompare(key(right._id))
        );
        const request = requests.get(key(sorted[0].verificationRequest));
        if (sorted.every(isPristinePending) &&
            !sorted.slice(1).some((execution) => key(execution._id) === key(request?.currentExecution))) {
            safeDuplicateGroups.push({
                requestId: key(sorted[0].verificationRequest),
                stepId: key(sorted[0].workflowStep),
                keepId: key(sorted[0]._id),
                archiveIds: sorted.slice(1).map((execution) => key(execution._id))
            });
        } else {
            violations.push({
                code: "CONFLICTING_EXECUTIONS",
                requestId: key(sorted[0].verificationRequest),
                stepId: key(sorted[0].workflowStep),
                executionIds: sorted.map((execution) => key(execution._id))
            });
        }
    }

    return {
        counts: {
            workflows: data.workflows.length,
            steps: data.steps.length,
            requests: data.requests.length,
            executions: data.executions.length
        },
        violations,
        safeDuplicateGroups
    };
}

async function planWorkflowMigration() {
    return analyzeWorkflowData(await loadWorkflowData());
}

function snapshotStep(step) {
    return {
        workflowStep: step.workflowStep || step._id,
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        title: step.title,
        description: step.description,
        isRequired: step.isRequired,
        maxRetries: step.maxRetries ?? 3,
        config: step.config || {}
    };
}

async function applyWorkflowMigration({ dryRun = true } = {}) {
    const data = await loadWorkflowData();
    const report = analyzeWorkflowData(data);
    if (dryRun) return report;
    if (report.violations.length > 0) {
        throw new Error(`Workflow migration preflight failed with ${report.violations.length} violation(s).`);
    }

    const stepsByWorkflow = groupBy(data.steps, (step) => key(step.workflowTemplate));
    const executionsByRequest = groupBy(data.executions, (execution) => key(execution.verificationRequest));
    const steps = new Map(data.steps.map((step) => [key(step._id), step]));
    const workflows = new Map(data.workflows.map((workflow) => [key(workflow._id), workflow]));
    const archiveIds = new Set(report.safeDuplicateGroups.flatMap((group) => group.archiveIds));
    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            for (const workflow of data.workflows) {
                const fields = { schemaVersion: 2 };
                if (!workflow.familyId) fields.familyId = workflow._id;
                await WorkflowTemplate.collection.updateOne({ _id: workflow._id }, { $set: fields }, { session });
            }
            for (const step of data.steps) {
                await WorkflowStep.collection.updateOne(
                    { _id: step._id },
                    { $set: { schemaVersion: 2, maxRetries: step.maxRetries ?? 3 } },
                    { session }
                );
            }
            for (const execution of data.executions.filter((item) => archiveIds.has(key(item._id)))) {
                await mongoose.connection.collection("workflow_migration_archives").updateOne(
                    { sourceExecution: execution._id },
                    { $setOnInsert: { sourceExecution: execution._id, originalDocument: execution, archivedAt: new Date() } },
                    { upsert: true, session }
                );
                await VerificationStepExecution.collection.deleteOne({ _id: execution._id }, { session });
            }

            for (const request of data.requests) {
                const workflow = workflows.get(key(request.workflowTemplate));
                const sourceSteps = request.workflowSnapshot?.steps?.length
                    ? request.workflowSnapshot.steps
                    : (stepsByWorkflow.get(key(workflow._id)) || []).filter((step) => step.status === "active" && !step.archivedAt);
                const snapshotSteps = sourceSteps.map(snapshotStep).sort((left, right) => left.stepOrder - right.stepOrder);
                const existing = (executionsByRequest.get(key(request._id)) || [])
                    .filter((execution) => !archiveIds.has(key(execution._id)));
                const byStep = new Map(existing.map((execution) => [key(execution.workflowStep), execution]));

                for (const snapshottedStep of snapshotSteps) {
                    const stepId = snapshottedStep.workflowStep;
                    const previous = byStep.get(key(stepId));
                    if (previous) {
                        const state = mapLegacyExecution(previous, steps.get(key(stepId)), data.documents);
                        await VerificationStepExecution.collection.updateOne(
                            { _id: previous._id },
                            { $set: {
                                status: state,
                                stepOrder: snapshottedStep.stepOrder,
                                stepSnapshot: snapshottedStep,
                                schemaVersion: 2,
                                stateVersion: previous.stateVersion ?? 0,
                                attempt: previous.attempt ?? 0,
                                maxRetries: previous.maxRetries ?? snapshottedStep.maxRetries
                            } },
                            { session }
                        );
                    } else {
                        const created = {
                            _id: new mongoose.Types.ObjectId(),
                            verificationRequest: request._id,
                            workflowStep: stepId,
                            status: "pending",
                            stepOrder: snapshottedStep.stepOrder,
                            stepSnapshot: snapshottedStep,
                            stateVersion: 0,
                            schemaVersion: 2,
                            attempt: 0,
                            maxRetries: snapshottedStep.maxRetries,
                            metadata: {},
                            startedAt: null,
                            completedAt: null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        await VerificationStepExecution.collection.insertOne(created, { session });
                        byStep.set(key(stepId), created);
                    }
                }

                const currentStepId = request.currentStep ||
                    (request.status === "pending" ? snapshotSteps[0]?.workflowStep : null);
                const currentExecution = currentStepId ? byStep.get(key(currentStepId))?._id : null;
                const fields = {
                    workflowVersion: request.workflowVersion || workflow._id,
                    workflowSnapshot: request.workflowSnapshot?.steps?.length
                        ? request.workflowSnapshot
                        : {
                            version: workflow.version || 1,
                            name: workflow.name,
                            description: workflow.description,
                            assignedVerifier: workflow.assignedVerifier,
                            steps: snapshotSteps
                        },
                    currentExecution,
                    schemaVersion: 2,
                    stateVersion: request.stateVersion ?? 0
                };
                if (request.status === "pending") fields.startedAt = null;
                await VerificationRequest.collection.updateOne(
                    { _id: request._id }, { $set: fields }, { session }
                );
            }
        });
    } finally {
        await session.endSession();
    }

    return verifyWorkflowMigration();
}

async function verifyWorkflowMigration() {
    const data = await loadWorkflowData();
    const report = analyzeWorkflowData(data);
    for (const workflow of data.workflows) {
        if (!workflow.familyId) report.violations.push({ code: "MISSING_VERSION_FAMILY", workflowId: key(workflow._id) });
    }
    const executionGroups = groupBy(data.executions, (execution) =>
        `${key(execution.verificationRequest)}:${key(execution.workflowStep)}`
    );
    for (const request of data.requests) {
        if (!request.workflowVersion || !request.workflowSnapshot?.steps?.length) {
            report.violations.push({ code: "MISSING_REQUEST_SNAPSHOT", requestId: key(request._id) });
            continue;
        }
        for (const step of request.workflowSnapshot.steps) {
            const count = (executionGroups.get(`${key(request._id)}:${key(step.workflowStep)}`) || []).length;
            if (count !== 1) report.violations.push({ code: "EXECUTION_COUNT_MISMATCH", requestId: key(request._id), stepId: key(step.workflowStep), count });
        }
    }
    return report;
}

async function installWorkflowIndexes() {
    const report = await verifyWorkflowMigration();
    if (report.violations.length > 0 || report.safeDuplicateGroups.length > 0) {
        throw new Error("Workflow index installation blocked by integrity violations.");
    }
    await WorkflowTemplate.collection.createIndex(
        { organization: 1, familyId: 1, version: 1 },
        { unique: true, name: "unique_workflow_family_version" }
    );
    await WorkflowStep.collection.createIndex(
        { workflowTemplate: 1, stepOrder: 1 },
        { unique: true, name: "unique_workflow_step_order" }
    );
    await VerificationStepExecution.collection.createIndex(
        { verificationRequest: 1, workflowStep: 1 },
        { unique: true, name: "unique_request_step_execution" }
    );
    return report;
}

module.exports = {
    planWorkflowMigration,
    applyWorkflowMigration,
    verifyWorkflowMigration,
    installWorkflowIndexes
};
