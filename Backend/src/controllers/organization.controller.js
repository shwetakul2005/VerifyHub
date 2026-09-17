const organizationService = require("../services/organization.service")

async function createOrganizationController(req,res){
    const data = req.body;
    if(!data){
        return res.status(400)
    }
    let organization;
    try{
         organization = await organizationService.createOrganization(data, req.user.id);
    }catch(err){
        return res.status(409).json({
            success: false,
            message: err.message
        })
    }
    
    return res.status(201).json({
        success: true,
        message: "Organization created successfully.",
        organization
    })
}

async function getOrganizationsController(req, res) {
    try {
        const organizations = await organizationService.getOrganizationsForUser(req.user.id);
        return res.status(200).json({ success: true, organizations });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message
        });
    }
}

async function getOrganizationByIdController(req, res) {
    try {
        const organization = await organizationService.getOrganizationById(
            req.params.id,
            req.user.id
        );
        return res.status(200).json({ success: true, organization });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message
        });
    }
}

module.exports = {
    createOrganizationController,
    getOrganizationsController,
    getOrganizationByIdController
};
