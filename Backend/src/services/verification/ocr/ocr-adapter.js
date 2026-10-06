const Tesseract = require("tesseract.js");

class OcrProcessingError extends Error {
    constructor(code) {
        super("OCR processing is temporarily unavailable.");
        this.name = "OcrProcessingError";
        this.code = code;
        this.retryable = true;
    }
}

function normalizedConfidence(value) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(1, Math.max(0, value / 100))
        : null;
}

function normalizeText(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
}

function createOcrAdapter(options = {}) {
    const createWorker = options.createWorker || (() => Tesseract.createWorker("eng"));
    const timeoutMs = options.timeoutMs || 30000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("OCR timeout must be positive.");

    async function recognize(filePath) {
        let worker;
        let timer;
        try {
            worker = await createWorker();
            const operation = worker.recognize(filePath);
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new OcrProcessingError("OCR_TIMEOUT")), timeoutMs);
            });
            const result = await Promise.race([operation, timeout]);
            if (!result?.data || typeof result.data.text !== "string") {
                throw new OcrProcessingError("OCR_INVALID_RESULT");
            }
            const data = result.data;
            return {
                schemaVersion: "1.0",
                provider: "tesseract",
                providerVersion: "7",
                language: "eng",
                text: normalizeText(data.text),
                confidence: normalizedConfidence(data.confidence),
                blocks: (Array.isArray(data.blocks) ? data.blocks : []).map((block) => ({
                    text: normalizeText(block.text),
                    confidence: normalizedConfidence(block.confidence)
                })).filter((block) => block.text)
            };
        } catch (error) {
            if (error instanceof OcrProcessingError) throw error;
            throw new OcrProcessingError("OCR_UNAVAILABLE");
        } finally {
            clearTimeout(timer);
            if (worker) {
                try { await worker.terminate(); } catch { /* Preserve the processing outcome. */ }
            }
        }
    }

    return { recognize };
}

module.exports = { OcrProcessingError, createOcrAdapter, normalizedConfidence };
