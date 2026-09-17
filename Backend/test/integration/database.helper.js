const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

async function startDatabase() {
    mongoServer = await MongoMemoryServer.create({
        instance: { dbName: "verifyhub-integration" }
    });
    await mongoose.connect(mongoServer.getUri(), {
        dbName: "verifyhub-integration"
    });
}

async function clearDatabase() {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function stopDatabase() {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = undefined;
    }
}

module.exports = {
    startDatabase,
    clearDatabase,
    stopDatabase
};
