const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let mongoReplicaSet;

async function startDatabase() {
    mongoReplicaSet = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            dbName: "verifyhub-integration",
            storageEngine: "wiredTiger"
        }
    });
    await mongoose.connect(mongoReplicaSet.getUri());
}

async function clearDatabase() {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function stopDatabase() {
    await mongoose.disconnect();
    if (mongoReplicaSet) {
        await mongoReplicaSet.stop();
        mongoReplicaSet = undefined;
    }
}

module.exports = {
    startDatabase,
    clearDatabase,
    stopDatabase
};
