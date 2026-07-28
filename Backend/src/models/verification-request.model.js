const mongoose = require("mongoose");

const verificationRequestSchema = new mongoose.Schema({
    organization:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    workflowTemplate:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowTemplate",
        required: true
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status:{
        type:String,
        enum:["pending", "in_progress", "completed", "rejected"],
        default: "pending"
    },
    currentStep:{
        type:mongoose.Schema.Types.ObjectId,
        ref: "WorkflowStep"
    },
    startedAt:{
        type: Date,
        default: null
    },
    completedAt:{
        type: Date,
        default: null
    }

},
{
    timestamps:true
})

const VerificationRequestModel = mongoose.model("VerificationRequest", verificationRequestSchema);
module.exports = VerificationRequestModel;
