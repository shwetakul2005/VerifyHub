const Organization = require("../models/organization.model");
const WorkflowTemplate = require("../models/workflow-template.model");
const WorkflowStep = require("../models/workflow-step.model");
const VerificationRequest = require("../models/verification-request.model");
const VerificationDocument = require("../models/verification-document.model");

class AccessError extends Error {
    constructor(message, statusCode = 403) {
        super(message);
        this.name = "AccessError";
        this.statusCode = statusCode;
    }
}

function idEquals(left, right) {
    if (left === null || left === undefined || right === null || right === undefined) {
        return false;
    }

    const leftId = left._id || left;
    const rightId = right._id || right;
    return String(leftId) === String(rightId);
}

function findMembership(organization, userId) {
    if ((organization.admin || []).some((adminId) => idEquals(adminId, userId))) {
        return { user: userId, role: "org_admin" };
    }

    return (organization.members || []).find((member) =>
        idEquals(member.user, userId)
    ) || null;
}

async function requireOrganizationRole(userId, organizationId, allowedRoles) {
    if (!organizationId) {
        throw new AccessError("Organization ID is required.", 400);
    }

    const organization = await Organization.findById(organizationId);

    if (!organization) {
        throw new AccessError("Organization not found.", 404);
    }

    if (organization.status !== "active") {
        throw new AccessError("Organization is not active.", 403);
    }

    const membership = findMembership(organization, userId);

    if (!membership || !allowedRoles.includes(membership.role)) {
        throw new AccessError("You are not authorized to access this organization.", 403);
    }

    return { organization, membership };
}

async function requireWorkflowRole(userId, workflowId, allowedRoles) {
    const workflow = await WorkflowTemplate.findById(workflowId);

    if (!workflow) {
        throw new AccessError("Workflow template not found.", 404);
    }

    const access = await requireOrganizationRole(
        userId,
        workflow.organization,
        allowedRoles
    );

    return { ...access, workflow };
}

async function requireWorkflowStepRole(userId, stepId, allowedRoles) {
    const step = await WorkflowStep.findById(stepId);

    if (!step) {
        throw new AccessError("Workflow step not found.", 404);
    }

    const access = await requireWorkflowRole(
        userId,
        step.workflowTemplate,
        allowedRoles
    );

    return { ...access, step };
}

async function requireRequestAccess(userId, requestId, options = {}) {
    const {
        allowApplicant = false,
        organizationRoles = [],
        requireAssignedVerifier = false
    } = options;

    const request = await VerificationRequest.findById(requestId)
        .populate("workflowTemplate");

    if (!request) {
        throw new AccessError("Verification request not found.", 404);
    }

    if (allowApplicant && idEquals(request.applicant, userId)) {
        return { request, accessType: "applicant" };
    }

    if (organizationRoles.length === 0) {
        throw new AccessError("You are not authorized to access this verification request.", 403);
    }

    const access = await requireOrganizationRole(
        userId,
        request.organization,
        organizationRoles
    );

    if (
        requireAssignedVerifier &&
        access.membership.role === "verifier" &&
        !idEquals(request.workflowTemplate?.assignedVerifier, userId)
    ) {
        throw new AccessError("You are not assigned to this verification request.", 403);
    }

    return { ...access, request, accessType: access.membership.role };
}

async function requireDocumentReviewer(userId, documentId) {
    const document = await VerificationDocument.findById(documentId).populate({
        path: "verificationRequest",
        populate: { path: "workflowTemplate" }
    });

    if (!document || !document.verificationRequest) {
        throw new AccessError("Document not found.", 404);
    }

    const request = document.verificationRequest;
    const access = await requireOrganizationRole(
        userId,
        request.organization,
        ["verifier"]
    );

    if (!idEquals(request.workflowTemplate?.assignedVerifier, userId)) {
        throw new AccessError("You are not assigned to review this document.", 403);
    }

    return { ...access, request, document };
}

async function requireDocumentAccess(userId, documentId) {
    const document = await VerificationDocument.findById(documentId).populate({
        path: "verificationRequest",
        populate: { path: "workflowTemplate" }
    });

    if (!document || !document.verificationRequest) {
        throw new AccessError("Document not found.", 404);
    }

    const request = document.verificationRequest;
    const access = await requireOrganizationRole(
        userId,
        request.organization,
        ["org_admin", "verifier"]
    );

    if (
        access.membership.role === "verifier" &&
        !idEquals(request.workflowTemplate?.assignedVerifier, userId)
    ) {
        throw new AccessError("You are not assigned to this verification request.", 403);
    }

    return { ...access, request, document };
}

module.exports = {
    AccessError,
    idEquals,
    findMembership,
    requireOrganizationRole,
    requireWorkflowRole,
    requireWorkflowStepRole,
    requireRequestAccess,
    requireDocumentReviewer,
    requireDocumentAccess
};
