const organizationModel = require("../models/organization.model")
const slugify = require('slugify');

async function createOrganization(data){
    const {name} = data;

    const orgSlug = slugify(name,{
        replacement: '-',
        lower: true,
        strict: true,
        trim: true
    });
    console.log(orgSlug);
    const existingOrganization = await organizationModel.findOne({slug:orgSlug});
    if(existingOrganization){
        throw new Error("Organization already exists.");
    }
    const newOrg = await organizationModel.create({name,slug:orgSlug});
    return newOrg;

}

module.exports = {createOrganization};