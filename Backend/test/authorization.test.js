const test = require("node:test");
const assert = require("node:assert/strict");

const Organization = require("../src/models/organization.model");
const VerificationRequest = require("../src/models/verification-request.model");
const VerificationDocument = require("../src/models/verification-document.model");
const {
    idEquals,
    findMembership,
    requireOrganizationRole,
    requireRequestAccess,
    requireDocumentReviewer
} = require("../src/services/authorization.service");

const originalOrganizationFindById = Organization.findById;
const originalRequestFindById = VerificationRequest.findById;
const originalDocumentFindById = VerificationDocument.findById;

test.afterEach(() => {
    Organization.findById = originalOrganizationFindById;
    VerificationRequest.findById = originalRequestFindById;
    VerificationDocument.findById = originalDocumentFindById;
});

test("idEquals handles populated and plain identifiers", () => {
    assert.equal(idEquals({ _id: "user-1" }, "user-1"), true);
    assert.equal(idEquals("user-1", { _id: "user-2" }), false);
    assert.equal(idEquals(null, "user-1"), false);
});

test("legacy organization admins resolve as org_admin members", () => {
    const membership = findMembership(
        { admin: ["admin-1"], members: [] },
        "admin-1"
    );

    assert.equal(membership.role, "org_admin");
});

test("organization access rejects a user from another tenant", async () => {
    Organization.findById = async () => ({
        _id: "org-a",
        status: "active",
        admin: [],
        members: [{ user: "member-a", role: "org_admin" }]
    });

    await assert.rejects(
        requireOrganizationRole("member-b", "org-a", ["org_admin"]),
        (error) => error.statusCode === 403
    );
});

test("organization access accepts only an allowed tenant role", async () => {
    Organization.findById = async () => ({
        _id: "org-a",
        status: "active",
        admin: [],
        members: [
            { user: "admin-a", role: "org_admin" },
            { user: "verifier-a", role: "verifier" }
        ]
    });

    const access = await requireOrganizationRole(
        "admin-a",
        "org-a",
        ["org_admin"]
    );
    assert.equal(access.membership.role, "org_admin");

    await assert.rejects(
        requireOrganizationRole("verifier-a", "org-a", ["org_admin"]),
        (error) => error.statusCode === 403
    );
});

test("an applicant can access their request without organization membership", async () => {
    const request = {
        _id: "request-a",
        applicant: "applicant-a",
        organization: "org-a",
        workflowTemplate: { assignedVerifier: "verifier-a" }
    };

    VerificationRequest.findById = () => ({
        populate: async () => request
    });

    const access = await requireRequestAccess("applicant-a", "request-a", {
        allowApplicant: true
    });

    assert.equal(access.accessType, "applicant");
});

test("another applicant cannot access a request", async () => {
    const request = {
        _id: "request-a",
        applicant: "applicant-a",
        organization: "org-a",
        workflowTemplate: { assignedVerifier: "verifier-a" }
    };

    VerificationRequest.findById = () => ({
        populate: async () => request
    });

    await assert.rejects(
        requireRequestAccess("applicant-b", "request-a", {
            allowApplicant: true
        }),
        (error) => error.statusCode === 403
    );
});

test("an administrator from another tenant cannot access a request", async () => {
    const request = {
        _id: "request-a",
        applicant: "applicant-a",
        organization: "org-a",
        workflowTemplate: { assignedVerifier: "verifier-a" }
    };

    VerificationRequest.findById = () => ({
        populate: async () => request
    });
    Organization.findById = async () => ({
        _id: "org-a",
        status: "active",
        admin: [],
        members: [{ user: "admin-a", role: "org_admin" }]
    });

    await assert.rejects(
        requireRequestAccess("admin-b", "request-a", {
            organizationRoles: ["org_admin"]
        }),
        (error) => error.statusCode === 403
    );
});

test("an unassigned verifier cannot access another verifier's request", async () => {
    const request = {
        _id: "request-a",
        applicant: "applicant-a",
        organization: "org-a",
        workflowTemplate: { assignedVerifier: "verifier-a" }
    };

    VerificationRequest.findById = () => ({
        populate: async () => request
    });
    Organization.findById = async () => ({
        _id: "org-a",
        status: "active",
        admin: [],
        members: [
            { user: "verifier-a", role: "verifier" },
            { user: "verifier-b", role: "verifier" }
        ]
    });

    await assert.rejects(
        requireRequestAccess("verifier-b", "request-a", {
            organizationRoles: ["verifier"],
            requireAssignedVerifier: true
        }),
        (error) => error.statusCode === 403
    );
});

test("only the assigned verifier can review a document", async () => {
    const document = {
        _id: "document-a",
        verificationRequest: {
            _id: "request-a",
            organization: "org-a",
            workflowTemplate: { assignedVerifier: "verifier-a" }
        }
    };

    VerificationDocument.findById = () => ({
        populate: async () => document
    });
    Organization.findById = async () => ({
        _id: "org-a",
        status: "active",
        admin: [],
        members: [
            { user: "verifier-a", role: "verifier" },
            { user: "verifier-b", role: "verifier" }
        ]
    });

    const access = await requireDocumentReviewer("verifier-a", "document-a");
    assert.equal(access.document._id, "document-a");

    await assert.rejects(
        requireDocumentReviewer("verifier-b", "document-a"),
        (error) => error.statusCode === 403
    );
});
