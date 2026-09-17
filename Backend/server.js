require("dotenv").config();
const app = require("./src/app");
const connectToDB = require("./src/config/database");


const port = Number(process.env.PORT || 3000);

async function startServer() {
    await connectToDB();
    app.listen(port,()=>{
        console.log(`Server is running on port ${port}`);
    });
}

startServer().catch((error) => {
    console.error("Unable to start server:", error.message);
    process.exit(1);
});
