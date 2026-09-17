const organizationModel = require("../models/organization.model")
const slugify = require('slugify');
const { requireOrganizationRole } = require("./authorization.service");

async function createOrganization(data, creatorId){
    const {name} = data;

    if (!name || !name.trim()) {
        throw new Error("Organization name is required.");
    }

    const orgSlug = slugify(name,{
        replacement: '-',
        lower: true,
        strict: true,
        trim: true
    });
    const existingOrganization = await organizationModel.findOne({slug:orgSlug});
    if(existingOrganization){
        throw new Error("Organization already exists.");
    }
    const newOrg = await organizationModel.create({
        name: name.trim(),
        slug: orgSlug,
        admin: [creatorId],
        members: [{ user: creatorId, role: "org_admin" }]
    });
    return newOrg;

}

async function getOrganizationsForUser(userId) {
    return organizationModel.find({
        status: "active",
        $or: [
            { admin: userId },
            { members: { $elemMatch: { user: userId } } }
        ]
    });
}

async function getOrganizationById(organizationId, userId) {
    const { organization } = await requireOrganizationRole(
        userId,
        organizationId,
        ["org_admin", "verifier", "analyst"]
    );
    return organization;
}

module.exports = {
    createOrganization,
    getOrganizationsForUser,
    getOrganizationById
};
