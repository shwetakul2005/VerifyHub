const mongoose = require("mongoose");

const blacklistTokenSchema = new mongoose.Schema({
    token:{
        type: String,
        required:[true,"token is required to be added in blacklist"],
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
})

blacklistTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const tokenBlacklistModel = mongoose.model("blacklistTokens", blacklistTokenSchema);
module.exports = tokenBlacklistModel;
