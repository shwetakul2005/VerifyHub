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

async function retryExecutionController(req, res) {
    try {
        const execution = await workflowEngineService.retryExecution(
            req.params.requestId,
            req.user.id,
            req.body.idempotencyKey
        );
        return res.status(200).json({ success: true, message: "Execution retry accepted.", execution });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.statusCode ? err.message : "Unable to retry execution.",
            code: err.code || undefined
        });
    }
}

async function cancelVerificationController(req, res) {
    try {
        const verificationRequest = await workflowEngineService.cancelVerification(
            req.params.requestId,
            req.user.id,
            req.body.reason
        );
        return res.status(200).json({ success: true, message: "Verification cancelled.", verificationRequest });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.statusCode ? err.message : "Unable to cancel verification.",
            code: err.code || undefined
        });
    }
}

module.exports = {
    startVerificationController,
    executeCurrentStepController,
    retryExecutionController,
    cancelVerificationController
};
