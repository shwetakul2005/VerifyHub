const test = require("node:test");
const assert = require("node:assert/strict");
const { createOcrAdapter } = require("../src/services/verification/ocr/ocr-adapter");

test("OCR adapter returns normalized confidence and text blocks and terminates its worker", async () => {
    let terminated = 0;
    const adapter = createOcrAdapter({
        createWorker: async () => ({
            recognize: async () => ({ data: {
                text: "  INCOME TAX\n  ABCDE1234F  ",
                confidence: 84,
                blocks: [{ text: "INCOME TAX", confidence: 92 }, { text: "ABCDE1234F", confidence: 76 }]
            } }),
            terminate: async () => { terminated += 1; }
        }),
        timeoutMs: 1000
    });
    const result = await adapter.recognize("synthetic.png");
    assert.equal(result.schemaVersion, "1.0");
    assert.equal(result.provider, "tesseract");
    assert.equal(result.text, "INCOME TAX\nABCDE1234F");
    assert.equal(result.confidence, 0.84);
    assert.deepEqual(result.blocks.map((block) => block.confidence), [0.92, 0.76]);
    assert.equal(terminated, 1);
});

test("OCR timeout is retryable and releases the worker", async () => {
    let terminated = 0;
    const adapter = createOcrAdapter({
        createWorker: async () => ({
            recognize: async () => new Promise(() => {}),
            terminate: async () => { terminated += 1; }
        }),
        timeoutMs: 20
    });
    await assert.rejects(adapter.recognize("synthetic.png"), (error) => {
        assert.equal(error.code, "OCR_TIMEOUT");
        assert.equal(error.retryable, true);
        return true;
    });
    assert.equal(terminated, 1);
});

test("OCR adapter rejects invalid confidence instead of inventing certainty", async () => {
    const adapter = createOcrAdapter({
        createWorker: async () => ({
            recognize: async () => ({ data: { text: "PAN", confidence: NaN, blocks: [] } }),
            terminate: async () => {}
        })
    });
    const result = await adapter.recognize("synthetic.png");
    assert.equal(result.confidence, null);
});
