const documentModel = require("../models/document.model");
async function getDocs(ownerId) {
    const docs = await documentModel.find({
        owner: ownerId
    })
    return docs;
}

module.exports = {getDocs};