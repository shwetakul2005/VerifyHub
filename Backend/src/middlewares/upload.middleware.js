const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create uploads/documents folder if it doesn't exist
const uploadDir = "uploads/documents";

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = require("../config/multerConfig");

module.exports = upload;