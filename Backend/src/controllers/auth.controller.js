const userModel = require("../models/user.model");
const tokenBlacklistModel = require("../models/blacklist.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


/**
 * Register a new user
 * @name registerUserController
 * @description Register a new user, expects username, email and password in the request body 
 * @access Public
 */
async function registerUserController(req, res) {

    const {username, email, password} = req.body

    if(!username || !email || !password){
        return res.status(400).json({
            message: "Please provide username, email and password"
        })
    }

    const isAlreadyUserExists = await userModel.findOne({
        $or: [{username},{email}]
    })

    if(isAlreadyUserExists){
        return res.status(400).json({
            message: "User already exists with this username or email"
        })
    }

    const hash = await bcrypt.hash(password,10)

    const newUser = await userModel.create({
        username,
        email, 
        password: hash
    });

    const token = jwt.sign(
        {id: newUser._id, username:newUser.username, role: newUser.role},
        process.env.JWT_SECRET,
        {expiresIn: "1d"}
    )

    res.cookie("token", token);

    res.status(201).json({
        message: "User registered successfully",
        user:{
            id: newUser._id,
            username: newUser.username,
            email: newUser.email
        }
    })

}

/**
 * Login for an existing user
 * @name: loginUserController
 * @description: login a user, expects email and password in the request body
 * @access: Public
 */
async function loginUserController(req,res){
    const {email, password} = req.body

    const user = await userModel.findOne({email}).select("+password");

    console.log(user);
    
    if(!user){
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if(!isPasswordValid){
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const token = jwt.sign(
        {id:user._id, username:user.username, role: user.role},
        process.env.JWT_SECRET,
        {expiresIn: "1d"}
    )

    res.cookie("token", token)
    res.status(200).json({
        message: "User logged in successfully.",
        user:{
            id: user._id,
            role: user.role,
            username: user.username,
            // email: user.email
        }
    })
}

/**
 * Logout for an existing user
 * @name: logoutUserController
 * @description: logout a user by clearing the token from cookies of the user and adding that token to the blacklist db
 * @access: Public
 */
async function logoutUserController(req,res) {
    const token = req.cookies.token
    if(token){
        await  tokenBlacklistModel.create({token})
    }
    res.clearCookie("token")

    res.status(200).json({
        message: "User logged out successfully"
    })
}

/**
 * @name getMeController
 * @description get the current logged in user details
 * @access private 
 */
async function getMeController(req,res){
    const user = await userModel.findById(req.user.id);
    
    res.status(200).json({
        message: "User details fetched successfully",
        user:{
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        }
    })
}

module.exports = { 
    registerUserController,  
    loginUserController, 
    logoutUserController,
    getMeController
};