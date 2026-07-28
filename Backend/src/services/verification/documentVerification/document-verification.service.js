const VerificationDocumentModel = require("../../../models/verification-document.model");
const VerificationStepExecutionModel = require("../../../models/verification-step-execution.model");
async function execute(verificationRequest) {
    // const workflowEngineService = require("../../workflow-engine.service");
    // Populate current workflow step
    // await VerificationStepExecutionModel.populate("currentStep");
    console.log("===== DOCUMENT EXECUTE CALLED =====");
    console.log("Request:", verificationRequest._id);

    // Find uploaded document(s) for the current step
    const documents = await VerificationDocumentModel.find({
        verificationRequest: verificationRequest._id,
        workflowStep: verificationRequest.currentStep._id
    });

    let execution =
    // console.log("verificationRequest");
    // console.log(verificationRequest._id);
        await VerificationStepExecutionModel.findOne({
            verificationRequest: verificationRequest._id,
            workflowStep: verificationRequest.currentStep._id,
            status: "in_progress",
        });

    

    if (!execution) {
        execution = await VerificationStepExecutionModel.create({
            verificationRequest: verificationRequest._id,
            workflowStep: verificationRequest.currentStep._id,
            status: "in_progress",
            startedAt: new Date(),
            metaData: {
                verificationType: "document"
            }
        });
    }
    // console.log(`execution: ${execution}`);
    // console.log(documents.length);
    if (documents.length === 0) {
        return {
            success: false,
            completed: false,
            message: "Waiting for applicant to upload the required document."
        };
    }
    console.log(execution);

    // ----------------------------------------------------
    // MOCK DOCUMENT VERIFICATION
    // (Replace this section with OCR + AI later)
    // ----------------------------------------------------

    for (const document of documents) {

        document.metadata = {
            ...document.metadata,
            verificationResult: "approved",
            verifiedBy: "system",
            confidence: 100
        };

        await document.save();
    }

    // ----------------------------------------------------

    execution.status = "completed";
    execution.completedAt = new Date();

    execution.metaData = {
        ...execution.metaData,
        result: "approved",
        documentsVerified: documents.length
    };

    await execution.save();

    return {
        success: true,
        completed: true,
        message: "Document verification completed successfully."
    };
}

module.exports = {
    execute
};