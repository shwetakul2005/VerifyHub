const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
    startDatabase,
    clearDatabase,
    stopDatabase
} = require("./database.helper");
const User = require("../../src/models/user.model");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

test("an aborted database transaction rolls back all writes", async () => {
    const session = await mongoose.startSession();

    try {
        await assert.rejects(
            session.withTransaction(async () => {
                await User.create([{
                    username: "Rolled Back User",
                    email: "rollback@example.com",
                    password: "not-a-real-password-hash"
                }], { session });

                throw new Error("force transaction rollback");
            }),
            /force transaction rollback/
        );
    } finally {
        await session.endSession();
    }

    assert.equal(
        await User.countDocuments({ email: "rollback@example.com" }),
        0
    );
});
