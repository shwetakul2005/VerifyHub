const uploadService  = require("../services/upload.service");
const getDocsService  = require("../services/get-docs.service");
const getDocByIdService  = require("../services/findDocumentById.service");
const deleteDocumentService = require("../services/deleteDocumentById.service");

async function uploadController(req,res){
    const {title, documentType} = req.body;
    
    if(!req.file){
        return res.status(400).json({
            message: "Please upload a document."
        })
    }
    const {
    filename: fileName,
    path: filePath,
    mimetype: mimeType,
    size: fileSize} = req.file;

    if(!title || !documentType){
        return res.status(400).json({
            message: "Please provide title and documentType"
        })
    }

    const {id} = req.user;
    const data = {owner:id,title,fileName,documentType, filePath, mimeType, fileSize};
    
    try{
        const document = await uploadService.createDocument(data);
        return res.status(201).json({
        message: "Document uploaded successfully.",
        document
    });
    }catch(err){
        console.error(err);
        return res.status(400).json({
            message: "Could not upload documents."
        })
    }

   
};

async function getDocsController(req,res) {
    const {id} = req.user;
    let documents;
    try{
        documents = await getDocsService.getDocs(id);
    }catch(err){
        return res.status(400).json({
            message: "Could not fetch documents."
        })
    }

    return res.status(200).json({
        success: true,
        message: "Documents fetched successfully.",
        count: documents.length,
        documents,
    })
    
}

async function getDocumentByIdController(req,res){
    const documentId  = req.params.id;
    const loggedInUserId  = req.user.id;
    
    const result = await getDocByIdService.getDocumentById(
        documentId,
        loggedInUserId
    );

    if (!result.success) {
        return res.status(result.status).json({
            success: false,
            message: result.message
        });
    }

    return res.status(200).json({
        success: true,
        message: "Document fetched successfully.",
        document: result.document
    });
}



async function deleteDocumentController(req, res) {
    const documentId = req.params.id;
    const loggedInUserId = req.user.id;

    const result = await deleteDocumentService.deleteDocumentById(
        documentId,
        loggedInUserId
    );

    if (!result.success) {
        return res.status(result.status).json({
            success: false,
            message: result.message
        });
    }

    return res.status(200).json({
        success: true,
        message: result.message
    });
}

module.exports = {
    uploadController,
    getDocsController,
    getDocumentByIdController,
    deleteDocumentController
};
