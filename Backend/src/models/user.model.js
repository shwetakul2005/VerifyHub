const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username:{
        type:String,
        unique:[true, "Username already exists"],
        required: true,
        trim:true
    },
    email:{
        type: String,
        unique: [true, "Account already exists with this email"],
        required: true,
        lowercase: true, 
        trim:true
    },
    password:{
        type:String,
        required: true,
        select: false
    },
    role:{
        type: String,
        enum: ["user", "verifier", "admin"],
        default: "user"
    },
    // Suppose a user is abusing the platform.
    // Instead of deleting them, the admin can simply disable their account.
    isActive:{
        type: Boolean,
        default: true
    },   
},
{
    timestamps: true,
}
);

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;