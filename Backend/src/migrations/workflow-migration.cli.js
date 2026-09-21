const mongoose = require("mongoose");
const {
    planWorkflowMigration,
    applyWorkflowMigration,
    verifyWorkflowMigration,
    installWorkflowIndexes
} = require("./workflow-migration");

const MODE_FLAGS = new Map([
    ["--apply", "apply"],
    ["--verify", "verify"],
    ["--install-indexes", "install-indexes"]
]);

function parseOptions(args) {
    const unknown = args.filter((argument) =>
        !MODE_FLAGS.has(argument) && argument !== "--backup-confirmed"
    );
    if (unknown.length > 0) {
        throw new Error(`Unknown option: ${unknown[0]}`);
    }

    const requestedModes = args.filter((argument) => MODE_FLAGS.has(argument));
    if (requestedModes.length > 1) {
        throw new Error("Choose only one migration mode.");
    }

    const mode = requestedModes.length === 0 ? "plan" : MODE_FLAGS.get(requestedModes[0]);
    const backupConfirmed = args.includes("--backup-confirmed");
    if (["apply", "install-indexes"].includes(mode) && !backupConfirmed) {
        throw new Error(`--${mode} requires --backup-confirmed.`);
    }
    return { mode, backupConfirmed };
}

async function run(options) {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
    await mongoose.connect(process.env.MONGO_URI);
    try {
        if (options.mode === "apply") return applyWorkflowMigration({ dryRun: false });
        if (options.mode === "verify") return verifyWorkflowMigration();
        if (options.mode === "install-indexes") return installWorkflowIndexes();
        return planWorkflowMigration();
    } finally {
        await mongoose.disconnect();
    }
}

async function main(args = process.argv.slice(2)) {
    const report = await run(parseOptions(args));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.violations?.length > 0) process.exitCode = 2;
}

if (require.main === module) {
    require("dotenv").config();
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { parseOptions, run, main };
