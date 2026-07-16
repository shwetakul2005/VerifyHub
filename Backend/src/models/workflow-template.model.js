const mongoose = require("mongoose");

const workflowTemplateSchema = new mongoose.Schema({
    organization:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    name:{
        type: String,
        required: true
    },
    description:{
        type: String,
        trim: true
    },
    status:{
        type: String,
        enum: ["draft", "published", "archived"],
        default: "draft"
    },
    createdBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
},{
    timestamps:true
})

const WorkflowTemplateSchema = mongoose.model("WorkflowTemplate", workflowTemplateSchema);
module.exports = WorkflowTemplateSchema;