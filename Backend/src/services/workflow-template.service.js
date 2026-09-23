const workflowTemplateModel = require("../models/workflow-template.model");
const workflowStepModel = require("../models/workflow-step.model");
const verificationRequestModel = require("../models/verification-request.model");
const AuditLog = require("../models/audit-log.model");
const UserModel = require("../models/user.model");
const mongoose = require("mongoose");
const {
    requireOrganizationRole,
    requireWorkflowRole,
    idEquals
} = require("./authorization.service");
const {
    WorkflowDefinitionError,
    assertDraftWorkflow,
    validatePublishableSteps
} = require("../domain/workflow-definition");

async function createWorkflowTemplate(data, actorId){
    
   const {
        name,
        organization,
        description,
        assignedVerifier
        } = data;

    await requireOrganizationRole(actorId, organization, ["org_admin"]);

    const existingWorkflow = await workflowTemplateModel.findOne({ name, organization, archivedAt: null });

    if(existingWorkflow) {
        throw new Error("Workflow template already exists.");
    }

    const verifier = await UserModel.findOne({
        _id: assignedVerifier,
        role: "verifier"
    });

    if (!verifier) {
        throw new Error("Invalid verifier selected.");
    }

    const verifierAccess = await requireOrganizationRole(
        assignedVerifier,
        organization,
        ["verifier"]
    );

    if (!idEquals(verifierAccess.membership.user, assignedVerifier)) {
        throw new Error("Selected verifier does not belong to this organization.");
    }

    const createdWorkflow = await workflowTemplateModel.create({
        ...data,
        createdBy: actorId,
        status: "draft"
    });
    return createdWorkflow;

}


async function getWorkflowTemplates(organizationId, actorId)
{
    await requireOrganizationRole(
        actorId,
        organizationId,
        ["org_admin", "verifier", "analyst"]
    );
    const allWorkflows = await workflowTemplateModel.find({ organization: organizationId, archivedAt: null });
    return allWorkflows;
}

async function getWorkflowTemplateById(id, actorId)
{
    const { workflow } = await requireWorkflowRole(
        actorId,
        id,
        ["org_admin", "verifier", "analyst"]
    );
    return workflow;
}

async function updateWorkflowTemplate(workflowId, data, actorId) {
    const { name, description } = data;

    const { workflow } = await requireWorkflowRole(
        actorId,
        workflowId,
        ["org_admin"]
    );
    assertDraftWorkflow(workflow);

    // Prevent duplicate workflow names within the same organization
    if (name && name !== workflow.name) {
        const existingWorkflow = await workflowTemplateModel.findOne({
            organization: workflow.organization,
            name,
            archivedAt: null
        });

        if (existingWorkflow) {
            throw new Error("Workflow template with this name already exists.");
        }

    }

    const changes = {};
    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;
    const updated = await workflowTemplateModel.findOneAndUpdate(
        { _id: workflowId, status: "draft" },
        { $set: changes },
        { returnDocument: "after", runValidators: true }
    );
    if (!updated) throw new WorkflowDefinitionError("Workflow is no longer an editable draft.");
    return updated;
}

async function deleteWorkflowTemplate(id, actorId, reason = "Removed by organization administrator") {
    const { workflow } = await requireWorkflowRole(actorId, id, ["org_admin"]);
    if (workflow.archivedAt) return workflow;

    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const current = await workflowTemplateModel.findById(id).session(session);
            if (!current) throw new WorkflowDefinitionError("Workflow no longer exists.");
            if (current.archivedAt) {
                result = current;
                return;
            }
            const referenced = await verificationRequestModel.exists({
                $or: [{ workflowTemplate: current._id }, { workflowVersion: current._id }]
            }).session(session);
            const mustArchive = current.status !== "draft" || Boolean(referenced);
            if (mustArchive) {
                const now = new Date();
                result = await workflowTemplateModel.findOneAndUpdate(
                    { _id: current._id, archivedAt: null },
                    { $set: { status: "archived", archivedAt: now, archivedBy: actorId, archiveReason: reason } },
                    { session, returnDocument: "after", runValidators: true }
                );
                await workflowStepModel.updateMany(
                    { workflowTemplate: current._id, archivedAt: null },
                    { $set: { status: "inactive", archivedAt: now, archivedBy: actorId, archiveReason: reason } },
                    { session }
                );
                await AuditLog.create([{
                    organization: current.organization,
                    action: "workflow_archived",
                    actor: actorId,
                    actorType: "user",
                    target: current._id,
                    targetModel: "WorkflowTemplate",
                    transition: { fromState: current.status, toState: "archived", command: "archive", reason }
                }], { session });
                return;
            }
            await workflowStepModel.deleteMany({ workflowTemplate: current._id }, { session });
            await workflowTemplateModel.deleteOne({ _id: current._id, status: "draft" }, { session });
            await AuditLog.create([{
                organization: current.organization,
                action: "workflow_deleted",
                actor: actorId,
                actorType: "user",
                target: current._id,
                targetModel: "WorkflowTemplate",
                transition: { fromState: "draft", command: "delete", reason }
            }], { session });
            result = current;
        });
    } finally {
        await session.endSession();
    }
    return result;
}

async function publishWorkflowTemplate(id, actorId) {
    const { workflow } = await requireWorkflowRole(actorId, id, ["org_admin"]);
    if (workflow.status === "published") return workflow;
    assertDraftWorkflow(workflow);

    const session = await mongoose.startSession();
    let published;
    try {
        await session.withTransaction(async () => {
            // Step writes also touch this document. A concurrent step mutation
            // therefore conflicts with the publish transaction rather than
            // slipping in after validation.
            const claimed = await workflowTemplateModel.findOneAndUpdate(
                { _id: workflow._id, status: "draft" },
                { $inc: { definitionRevision: 1 } },
                { session, returnDocument: "after" }
            );
            if (!claimed) throw new WorkflowDefinitionError("Workflow is no longer an editable draft.");
            const steps = await workflowStepModel.find({ workflowTemplate: workflow._id }).session(session);
            validatePublishableSteps(steps);
            published = await workflowTemplateModel.findByIdAndUpdate(
                workflow._id,
                {
                    $set: {
                        status: "published",
                        familyId: workflow.familyId || workflow._id,
                        publishedAt: new Date(),
                        publishedBy: actorId,
                        schemaVersion: 2
                    }
                },
                { session, returnDocument: "after", runValidators: true }
            );
        });
    } finally {
        await session.endSession();
    }
    return published;
}

async function createWorkflowVersion(id, actorId) {
    const { workflow } = await requireWorkflowRole(actorId, id, ["org_admin"]);
    if (workflow.status !== "published") {
        throw new WorkflowDefinitionError("Only a published workflow can create a new version.");
    }

    const indexes = await workflowTemplateModel.collection.listIndexes().toArray();
    const versionIndex = indexes.find((index) => index.name === "unique_workflow_family_version");
    if (!versionIndex?.unique ||
        JSON.stringify(versionIndex.key) !== JSON.stringify({ organization: 1, familyId: 1, version: 1 })) {
        const error = new Error("Workflow versioning is unavailable until the unique version index is installed.");
        error.statusCode = 503;
        throw error;
    }

    const familyId = workflow.familyId || workflow._id;
    const session = await mongoose.startSession();
    let createdWorkflow;
    try {
        await session.withTransaction(async () => {
            const source = await workflowTemplateModel.findOne({
                _id: workflow._id,
                status: "published",
                archivedAt: null
            }).session(session);
            if (!source) {
                throw new WorkflowDefinitionError("Archived workflows cannot create new versions.");
            }
            const latest = await workflowTemplateModel.findOne({
                organization: source.organization,
                familyId
            }).sort({ version: -1 }).session(session);
            const [created] = await workflowTemplateModel.create([{
                organization: source.organization,
                name: source.name,
                description: source.description,
                status: "draft",
                version: (latest?.version || source.version) + 1,
                familyId,
                previousVersion: source._id,
                schemaVersion: 2,
                createdBy: actorId,
                assignedVerifier: source.assignedVerifier
            }], { session });
            createdWorkflow = created;

            const sourceSteps = await workflowStepModel.find({
                workflowTemplate: source._id,
                archivedAt: null
            }).sort({ stepOrder: 1 }).session(session).lean();
            if (sourceSteps.length > 0) {
                await workflowStepModel.insertMany(sourceSteps.map((step) => ({
                    workflowTemplate: created._id,
                    stepOrder: step.stepOrder,
                    stepType: step.stepType,
                    title: step.title,
                    description: step.description,
                    isRequired: step.isRequired,
                    maxRetries: step.maxRetries,
                    schemaVersion: 2,
                    status: step.status,
                    config: step.config
                })), { session });
            }
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new WorkflowDefinitionError("A workflow version was created concurrently.");
        }
        throw error;
    } finally {
        await session.endSession();
    }
    return createdWorkflow;
}


module.exports = {
                    createWorkflowTemplate, 
                    getWorkflowTemplates, 
                    getWorkflowTemplateById,
                    updateWorkflowTemplate, 
                    deleteWorkflowTemplate,
                    publishWorkflowTemplate,
                    createWorkflowVersion
                }
