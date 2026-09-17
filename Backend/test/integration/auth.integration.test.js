const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
    startDatabase,
    clearDatabase,
    stopDatabase
} = require("./database.helper");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.GOOGLE_CLIENT_ID = "integration-test-client";
process.env.GOOGLE_CLIENT_SECRET = "integration-test-secret";
process.env.GOOGLE_REFRESH_TOKEN = "integration-test-refresh";
process.env.GOOGLE_USER = "integration@example.com";

const app = require("../../src/app");
const User = require("../../src/models/user.model");
const BlacklistedToken = require("../../src/models/blacklist.model");

test.before(startDatabase);
test.afterEach(clearDatabase);
test.after(stopDatabase);

test("registration persists a normalized user and establishes an authenticated session", async () => {
    const agent = request.agent(app);

    const registration = await agent
        .post("/api/auth/register")
        .send({
            username: "Applicant One",
            email: "APPLICANT@EXAMPLE.COM",
            password: "test-pass-123"
        });

    assert.equal(registration.status, 201);
    assert.match(registration.headers["set-cookie"][0], /^token=/);

    const storedUser = await User.findOne({ email: "applicant@example.com" });
    assert.equal(storedUser.username, "Applicant One");

    const currentUser = await agent.get("/api/auth/get-me");
    assert.equal(currentUser.status, 200);
    assert.equal(currentUser.body.user.email, "applicant@example.com");
});

test("logout blacklists the session token and prevents subsequent reuse", async () => {
    const agent = request.agent(app);

    await agent.post("/api/auth/register").send({
        username: "Applicant Two",
        email: "applicant.two@example.com",
        password: "test-pass-123"
    });

    const logout = await agent.post("/api/auth/logout");
    assert.equal(logout.status, 200);
    assert.equal(await BlacklistedToken.countDocuments(), 1);

    const currentUser = await agent.get("/api/auth/get-me");
    assert.equal(currentUser.status, 401);
});
