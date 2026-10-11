const { extractDocumentEvidence } = require("../../../domain/document-evidence");
const {drivingLicenseParser} = require("../ocr/parsers/drivingLicense.parser");

async function findParser(docType, input) {
    if (docType === "PAN" || docType === "Aadhaar") {
        const evidence = extractDocumentEvidence(docType === "Aadhaar" ? "AADHAAR" : "PAN", input);
        const values = Object.fromEntries(Object.entries(evidence.fields).map(([key, item]) => [key, item.value]));
        return { ...values, evidence };
    }
    if (docType === "Driving License") {
        const text = typeof input === "string" ? input : input?.text || "";
        return drivingLicenseParser(text);
    }
    return undefined;
}

module.exports = {findParser};

