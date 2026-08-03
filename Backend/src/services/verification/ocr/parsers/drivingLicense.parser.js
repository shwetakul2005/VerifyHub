function parseDrivingLicense(rawText) {

    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const result = {
        name: null,
        licenseNumber: null,
        dob: null,
        expiryDate: null
    };

    // -------------------------
    // Driving Licence Number
    // Examples:
    // MH1220210001234
    // MH-12-20210001234
    // DL No: MH1220210001234
    // -------------------------

    const dlRegex =
        /\b([A-Z]{2}[- ]?\d{2}[- ]?\d{4,12})\b/i;

    const dlMatch = rawText.match(dlRegex);

    if (dlMatch) {
        result.licenseNumber = dlMatch[1].replace(/[- ]/g, "");
    }

    // -------------------------
    // DOB
    // -------------------------

    const dobRegex =
        /(DOB|Date\s*of\s*Birth|Birth|जन्म|DOB\/Birth)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i;

    const dobMatch = rawText.match(dobRegex);

    if (dobMatch) {
        result.dob = dobMatch[2];
    }

    // -------------------------
    // Valid Till / Expiry
    // -------------------------

    const expiryRegex =
        /(Valid\s*Till|Valid\s*Upto|Expiry|Expires)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i;

    const expiryMatch = rawText.match(expiryRegex);

    if (expiryMatch) {
        result.expiryDate = expiryMatch[2];
    }

    // -------------------------
    // Name
    // -------------------------

    const blacklist = [
        "government",
        "india",
        "licence",
        "license",
        "transport",
        "motor",
        "valid",
        "birth",
        "address",
        "authority",
        "driving"
    ];

    for (const line of lines) {

        if (/\d/.test(line)) continue;

        const lower = line.toLowerCase();

        if (blacklist.some(word => lower.includes(word))) continue;

        if (/^[A-Za-z.\s]{4,}$/.test(line)) {
            result.name = line;
            break;
        }
    }

    return result;
}

async function drivingLicenseParser(text) {
    const result = parseDrivingLicense(text);

    return result;

};

module.exports = {drivingLicenseParser};