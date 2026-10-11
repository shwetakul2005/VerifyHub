const fs = require("node:fs/promises");

class MlServiceError extends Error {
    constructor(code, retryable) {
        super("Verification analysis is temporarily unavailable.");
        this.name = "MlServiceError";
        this.code = code;
        this.retryable = retryable;
    }
}

function filePart(file, fallbackName) {
    return fs.readFile(file.path).then((bytes) => ({
        blob: new Blob([bytes], { type: file.mimetype || "application/octet-stream" }),
        name: file.originalname || fallbackName
    }));
}

function createMlVerificationClient(options = {}) {
    const baseUrl = options.baseUrl || process.env.ML_SERVICE_URL || "http://localhost:8000";
    const request = options.fetch || fetch;
    const timeoutMs = options.timeoutMs || 30000;

    async function post(path, parts) {
        const form = new FormData();
        for (const [name, value] of Object.entries(parts)) {
            const part = await filePart(value.file, value.fallbackName);
            form.append(name, part.blob, part.name);
        }
        let response;
        try {
            response = await request(`${baseUrl}${path}`, {
                method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs)
            });
        } catch {
            throw new MlServiceError("ML_SERVICE_UNAVAILABLE", true);
        }
        let payload;
        try { payload = await response.json(); } catch { throw new MlServiceError("ML_INVALID_RESPONSE", true); }
        if (!response.ok) {
            throw new MlServiceError(payload?.code || "ML_SERVICE_ERROR", response.status >= 500);
        }
        return payload;
    }

    return {
        analyzeDocumentQuality: (file) => post("/v1/image-quality/document", {
            file: { file, fallbackName: "document.jpg" }
        }),
        analyzeSelfieQuality: (file) => post("/v1/image-quality/selfie", {
            file: { file, fallbackName: "selfie.jpg" }
        }),
        compareFaces: (document, selfie) => post("/v1/face/compare", {
            document: { file: document, fallbackName: "document.jpg" },
            selfie: { file: selfie, fallbackName: "selfie.jpg" }
        })
    };
}

module.exports = { MlServiceError, createMlVerificationClient };
