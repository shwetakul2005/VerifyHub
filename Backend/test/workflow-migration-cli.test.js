const test = require("node:test");
const assert = require("node:assert/strict");

const { parseOptions } = require("../src/migrations/workflow-migration.cli");

test("workflow migration CLI defaults to a read-only preflight", () => {
    assert.deepEqual(parseOptions([]), { mode: "plan", backupConfirmed: false });
});

test("workflow migration CLI requires backup confirmation before writes", () => {
    assert.throws(() => parseOptions(["--apply"]), /backup-confirmed/i);
    assert.throws(() => parseOptions(["--install-indexes"]), /backup-confirmed/i);

    assert.deepEqual(parseOptions(["--apply", "--backup-confirmed"]), {
        mode: "apply",
        backupConfirmed: true
    });
    assert.deepEqual(parseOptions(["--install-indexes", "--backup-confirmed"]), {
        mode: "install-indexes",
        backupConfirmed: true
    });
});

test("workflow migration CLI rejects conflicting and unknown options", () => {
    assert.throws(
        () => parseOptions(["--apply", "--install-indexes", "--backup-confirmed"]),
        /one migration mode/i
    );
    assert.throws(() => parseOptions(["--surprise"]), /unknown option/i);
});
