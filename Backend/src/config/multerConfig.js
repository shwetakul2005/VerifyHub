const multer = require('multer');
const path = require('path');

// 1. Define storage location and file naming strategy
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure this folder exists in your project directory
    cb(null, 'uploads/documents/'); 
  },
  filename: (req, file, cb) => {
    // Generate a unique filename using timestamps to prevent overwrites
    const uniqueSuffix =`${Date.now()}-${req.user.id}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 2. Define a file filter to restrict file types (Optional but recommended)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = allowedTypes.test(file.mimetype);

  if (extName && mimeType) {
    return cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed formats: PDF, JPG, JPEG, PNG.'), false);
  }
};

// 3. Initialize Multer with configuration options
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5 // Limit file size to 5MB
  },
  fileFilter: fileFilter
});

module.exports = upload;