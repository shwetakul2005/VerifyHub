function parsePAN(rawText) {

    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const result = {
        name: null,
        fatherName: null,
        panNumber: null,
        dob: null
    };

    // -------------------------
    // PAN Number
    // ABCDE1234F
    // -------------------------

    const panRegex =
        /\b[A-Z]{5}\d{4}[A-Z]\b/;

    const panMatch = rawText.match(panRegex);

    if (panMatch) {
        result.panNumber = panMatch[0];
    }

    // -------------------------
    // DOB
    // -------------------------

    const dobRegex =
        /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/;

    const dobMatch = rawText.match(dobRegex);

    if (dobMatch) {
        result.dob = dobMatch[1];
    }

    // -------------------------
    // Names
    // -------------------------

    const blacklist = [
        "income",
        "tax",
        "department",
        "india",
        "government",
        "permanent",
        "account",
        "number",
        "signature"
    ];

    const candidates = [];

    for (const line of lines) {

        if (/\d/.test(line)) continue;

        const lower = line.toLowerCase();

        if (blacklist.some(word => lower.includes(word))) continue;

        if (/^[A-Za-z.\s]{4,}$/.test(line)) {
            candidates.push(line);
        }
    }

    if (candidates.length > 0)
        result.name = candidates[0];

    if (candidates.length > 1)
        result.fatherName = candidates[1];

    return result;
}

async function panCardParser(text) {
    const result = parsePAN(text);

    return result;

};

module.exports = {panCardParser};