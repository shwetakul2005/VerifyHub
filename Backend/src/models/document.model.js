const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title:{
        type: String,
        required:[true,"Title is required to "],
        trim: true
    },
    documentType: {
    type: String,
    enum: [
        "Aadhaar",
        "PAN",
        "Passport",
        "Driving License",
        "Degree Certificate",
        "Marksheet",
        "Other"
    ],
    required: true
    },
    fileName:{
        type: String,
        required: true
    },
    filePath:{
        type: String,
        required: true
    },
    // Media Types: standardized label sent over the internet to identify the format of a file or data
    mimeType:{
        type: String,
        required: true
    },
    fileSize:{
        type: Number,
        required: true
    },
    // status:{
    //     enum: ["uploaded", "under review", "approved", "rejected"],
    // }
},{
    timestamps: true
} )

module.exports = mongoose.model("Document", documentSchema);