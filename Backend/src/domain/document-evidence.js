// Structural checks only. Passing them does not verify government records or authenticity.
const MULTIPLICATION = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const PERMUTATION = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function normalizeAadhaar(value) {
    return String(value || "").replace(/[ -]/g, "");
}

function validateAadhaar(value) {
    const number = normalizeAadhaar(value);
    if (!/^[1-9][0-9]{11}$/.test(number)) return false;
    let check = 0;
    [...number].reverse().forEach((digit, index) => {
        check = MULTIPLICATION[check][PERMUTATION[index % 8][Number(digit)]];
    });
    return check === 0;
}

function normalizePan(value) {
    return String(value || "").toUpperCase().replace(/[ -]/g, "");
}

function validatePan(value) {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(value));
}

function boundedConfidence(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
        ? value : null;
}

function confidenceFor(value, evidence) {
    const normalizedValue = String(value).replace(/[ -]/g, "").toUpperCase();
    const block = (evidence.blocks || []).find((item) =>
        String(item.text || "").replace(/[ -]/g, "").toUpperCase().includes(normalizedValue));
    return boundedConfidence(block?.confidence) ?? boundedConfidence(evidence.confidence);
}

function field(value, evidence, formatValid = true) {
    return { value, confidence: confidenceFor(value, evidence), source: "ocr", formatValid };
}

function uniqueMatches(text, pattern, normalize) {
    return [...new Set((text.match(pattern) || []).map(normalize))];
}

function extractNames(lines) {
    const excluded = /income|tax|department|permanent|account|number|government|india|aadhaar|uidai|signature|date|birth|male|female|address|identity/i;
    return lines.filter((line) => /^[A-Za-z. ]{4,}$/.test(line) && /\s/.test(line) && !excluded.test(line));
}

function extractDocumentEvidence(declaredType, input) {
    const evidence = typeof input === "string" ? { text: input, confidence: null, blocks: [] } : input || {};
    const text = String(evidence?.text || "");
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const panCandidates = uniqueMatches(text, /\b[A-Z]{5}[ -]?[0-9]{4}[ -]?[A-Z]\b/gi, normalizePan);
    const aadhaarCandidates = uniqueMatches(text, /\b[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}\b/g, normalizeAadhaar);
    const panSignals = Number(/income\s+tax\s+department/i.test(text)) +
        Number(/permanent\s+account\s+number/i.test(text)) + Number(panCandidates.length === 1);
    const aadhaarSignals = Number(/\baadhaar\b|\buidai\b/i.test(text)) + Number(aadhaarCandidates.length === 1);
    const conflict = panSignals > 0 && aadhaarSignals > 0;
    const detectedType = conflict ? null : panSignals > 0 ? "PAN" : aadhaarSignals > 0 ? "AADHAAR" : null;
    const signalCount = detectedType === "PAN" ? panSignals : detectedType === "AADHAAR" ? aadhaarSignals : 0;
    const typeConfidence = detectedType
        ? Number((Math.min(0.95, 0.6 + 0.3 * (signalCount - 1)) * (boundedConfidence(evidence.confidence) ?? 0.5)).toFixed(4))
        : 0;
    const typeMatches = detectedType === declaredType && typeConfidence >= 0.75;
    const reasonCodes = [];
    if (conflict) reasonCodes.push("EVIDENCE_CONFLICT");
    if (typeConfidence < 0.75) reasonCodes.push("DOCUMENT_TYPE_UNCERTAIN");
    else if (detectedType !== declaredType) reasonCodes.push("DOCUMENT_TYPE_MISMATCH");

    const fields = {};
    const names = extractNames(lines);
    if (names[0]) fields.name = field(names[0], evidence);
    else reasonCodes.push("REQUIRED_FIELD_MISSING");
    if (declaredType === "PAN" && names[1]) fields.fatherName = field(names[1], evidence);

    if (declaredType === "PAN") {
        if (panCandidates.length > 1) reasonCodes.push("EVIDENCE_CONFLICT");
        else if (panCandidates.length === 1) {
            const value = panCandidates[0];
            fields.panNumber = field(value, evidence, validatePan(value));
            if (!fields.panNumber.formatValid) reasonCodes.push("PAN_FORMAT_INVALID");
        } else reasonCodes.push("REQUIRED_FIELD_MISSING");
    } else if (declaredType === "AADHAAR") {
        if (aadhaarCandidates.length > 1) reasonCodes.push("EVIDENCE_CONFLICT");
        else if (aadhaarCandidates.length === 1) {
            const value = aadhaarCandidates[0];
            fields.aadhaarNumber = field(value, evidence, validateAadhaar(value));
            if (!fields.aadhaarNumber.formatValid) reasonCodes.push("AADHAAR_FORMAT_INVALID");
        } else reasonCodes.push("REQUIRED_FIELD_MISSING");
    }
    const dob = text.match(/\b[0-3][0-9][/-][01][0-9][/-][12][0-9]{3}\b/);
    if (dob) fields.dob = field(dob[0], evidence);
    const gender = text.match(/\b(male|female)\b/i);
    if (gender && declaredType === "AADHAAR") fields.gender = field(gender[0].toUpperCase(), evidence);
    if (Object.values(fields).some((item) => item.confidence === null || item.confidence < 0.75)) {
        reasonCodes.push("FIELD_LOW_CONFIDENCE");
    }

    return { declaredType, detectedType, typeConfidence, typeMatches, fields,
        reasonCodes: [...new Set(reasonCodes)] };
}

module.exports = { validateAadhaar, validatePan, normalizeAadhaar, normalizePan, extractDocumentEvidence };
