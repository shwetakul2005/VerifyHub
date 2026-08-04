
async function aadhaarValidityChecker(extractedText){
    // name verification


    // dob verification


    // gender verification


    // aadhaar num verification
}

async function aadhaarNumChecker(aadhaarNum) {
    if(aadhaarNum.length() !== 12){
        throw new Error("Aadhaar number not valid.");
    }
}