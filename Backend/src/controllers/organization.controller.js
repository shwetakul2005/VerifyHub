const organizationService = require("../services/organization.service")

async function createOrganizationController(req,res){
    const data = req.body;
    if(!data){
        return res.status(400)
    }
    let organization;
    try{
         organization = await organizationService.createOrganization(data);
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

module.exports = {createOrganizationController};