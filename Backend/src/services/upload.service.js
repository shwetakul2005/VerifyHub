const documentModel = require("../models/document.model");

async function createDocument(data) {
    
    console.log(data);
    const document = await documentModel.create(data);
    return document;
    
}

module.exports = {createDocument};