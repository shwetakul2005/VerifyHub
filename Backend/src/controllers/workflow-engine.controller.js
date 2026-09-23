const workflowEngineService = require("../services/workflow-engine.service");

async function startVerificationController(req,res){
    const { requestId } = req.params;
    let verificationRequest;
    try{
        verificationRequest = await workflowEngineService.startVerification(requestId, req.user.id);
    }catch(err){
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.statusCode ? err.message : "Unable to start verification.",
            code: err.code || undefined
        })
    }

    return res.status(200).json({
        "success": true,
        "message": "Verification started successfully.",
        verificationRequest
    })
}

async function executeCurrentStepController(req,res){
    const { requestId } = req.params;
    let verificationRequest;
    try{
        verificationRequest = await workflowEngineService.executeCurrentStep(requestId, req.user.id);
    }catch(err){
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.statusCode ? err.message : "Unable to execute verification step.",
            code: err.code || undefined
        })
    }

    return res.status(200).json({
        "success": true,
        "message": "Verification step executed successfully.",
        verificationRequest
    })
}

module.exports = {startVerificationController, executeCurrentStepController};
