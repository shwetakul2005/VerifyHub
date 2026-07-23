const mongoose = require("mongoose");
const VerificationRequest = require("../models/verification-request.model");
const WorkflowStep = require("../models/workflow-step.model");

const VerificationStepExecutionSchema = new mongoose.Schema({
    verificationRequest:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "VerificationRequest"
    },
    workflowStep:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkflowStep"
    },
    status:{
        type:String,
        enum: ["pending", "in_progress", "completed", "failed"],
        default: "pending"
    },
    metaData:{
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    startedAt:{
        type: Date,
        default: null
    },
    completedAt:{
        type: Date,
        default: null
    }
},{
    timestamps:true
})

const verificationStepExecution = mongoose.model("VerificationStepExecution", VerificationStepExecutionSchema);
module.exports = verificationStepExecution;