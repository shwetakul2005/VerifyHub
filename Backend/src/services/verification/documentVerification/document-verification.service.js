const VerificationDocumentModel = require("../../../models/verification-document.model");
const VerificationStepExecutionModel = require("../../../models/verification-step-execution.model");
const { findParser } = require("../ocr/findParser");
const ocrService = require("../ocr/ocr.service");


async function execute(verificationRequest) {
    // const workflowEngineService = require("../../workflow-engine.service");
    // Populate current workflow step
    // await VerificationStepExecutionModel.populate("currentStep");
    // console.log("===== DOCUMENT EXECUTE CALLED =====");
    // console.log("Request:", verificationRequest._id);

    // Find uploaded document(s) for the current step
    const documents = await VerificationDocumentModel.find({
        verificationRequest: verificationRequest._id,
        workflowStep: verificationRequest.currentStep._id
    });

    if (documents.length === 0) {
        return {
            success: false,
            completed: false,
            message: "Waiting for applicant to upload the required document."
        };
    }

    const unprocessedDocuments = documents.filter((document) =>
        !document.metadata?.ocr
    );

    if (unprocessedDocuments.length === 0) {
        return {
            success: false,
            completed: false,
            message: "Document has been processed and is waiting for verifier review."
        };
    }

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
            metadata: {
                verificationType: "document"
            }
        });
    }
    // console.log(`execution: ${execution}`);
    // console.log(documents.length);
   

    for (const document of unprocessedDocuments) {
        const imagePath = document.filePath;
        const rawText = await ocrService.extractText(imagePath);
        const docType = document.documentType;
        const result = await findParser(docType, rawText);
        
        document.metadata = {
            ...document.metadata,
            ocr:{
                rawText: rawText,
            },
            extracted:{
                result: result,
            }
        };
        await document.save();
    }

    // execution.status = "completed";
    // execution.completedAt = new Date();

    // execution.metadata = {
    //     ...execution.metadata,
    //     result: "approved",
    //     documentsVerified: documents.length
    // };

    // await execution.save();

    return {
        success: true,
        completed: false,
        message: "Document uploaded and processed. Waiting for verifier review."
    };
}

module.exports = {
    execute
};