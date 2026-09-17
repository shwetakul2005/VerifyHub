const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema({
    name:{
        type:String,
        unique:[true, "Organization already exists"],
        required: true,
        trim:true
    },
    slug:{
        type: String,
        unique: [true, "Slug already exists."],
        lowercase: true, 
        trim:true
    },
    status:{
        type: String,
        enum: ["active", "suspended"],
        default: "active"
    },
    admin: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    members: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        role: {
            type: String,
            enum: ["org_admin", "verifier", "analyst"],
            default: "verifier"
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    settings: {
        allowedStepTypes: [{
            type: String
        }],
        defaultVerifier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        branding: {
            logo: String,
            primaryColor: String,
            secondaryColor: String
        }
    }
},
{
    timestamps: true,
}
);

const organizationModel = mongoose.model("Organization", organizationSchema);

module.exports = organizationModel;