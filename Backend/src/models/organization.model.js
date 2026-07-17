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
},
{
    timestamps: true,
}
);

const organizationModel = mongoose.model("Organization", organizationSchema);

module.exports = organizationModel;