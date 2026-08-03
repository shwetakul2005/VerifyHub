const {aadhaarParser} = require("../ocr/parsers/aadhaar.parser")
const {drivingLicenseParser} = require("../ocr/parsers/drivingLicense.parser");
const { panCardParser } = require("./parsers/panCard.parser");

async function findParser(docType, rawText) {
    let result;
    if(docType == "Aadhaar"){
        result = await aadhaarParser(rawText);
    }

    if(docType == "Driving License"){
        result = await drivingLicense.drivingLicense(rawText);
    }

    if(docType == "Pan Card"){
        result = await panCardParser(rawText);
    }

    return result;
}

module.exports = {findParser};

