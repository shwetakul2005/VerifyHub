const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")
const userModel = require("../models/user.model");


async function authUser(req, res, next){

    const token = req.cookies.token
    if(!token){
        return res.status(401).json({
            message: "Token not provided."
        })
    }

    try{
        const isTokenBlacklisted = await tokenBlacklistModel.findOne({token});
        if(isTokenBlacklisted){
            return res.status(401).json({
                message: "Token is invalid."
            })
        }

        const decoded =  jwt.verify(token, process.env.JWT_SECRET)
        const user = await userModel.findOne({ _id: decoded.id, isActive: true }).select("_id username role");

        if (!user) {
            return res.status(401).json({ message: "Account is inactive or unavailable." });
        }

        req.user = {
            id: user._id.toString(),
            username: user.username,
            role: user.role
        }

        next();
    } catch(err){
        return res.status(401).json({
            message: "Invalid token."
        })
    }
}

module.exports = {authUser};
