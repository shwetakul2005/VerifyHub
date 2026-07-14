const mongoose = require("mongoose");

async function connectToDB() {
    await mongoose.connect(process.env.MONGO_URI)
    try{console.log("Connected to Database");}
    catch(err){
        console.log(err);
    }
}

module.exports = connectToDB;