const WorkflowEngineServices = require("../services/workflow-engine.service");

async function startVerificationController(req,res){
    const { requestId } = req.params;
    let verificationRequest;
    try{
        verificationRequest = await WorkflowEngineServices.startVerification(requestId);
    }catch(err){
        return res.status(400).json({
            success: false,
            message: err.message
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
        verificationRequest = await WorkflowEngineServices.executeCurrentStep(requestId);
    }catch(err){
        return res.status(400).json({
            success: false,
            message: err.message
        })
    }

    return res.status(200).json({
        "success": true,
        "message": "Verification step executed successfully.",
        verificationRequest
    })
}

module.exports = {startVerificationController, executeCurrentStepController};