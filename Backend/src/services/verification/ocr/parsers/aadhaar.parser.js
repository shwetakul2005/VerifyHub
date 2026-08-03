/*
= స A
hd >- కా
ab © GOVERNMENT OF INDIA™~ ౮ lal,

శ్వేత కులకర్ణి

Shweta Kulkami

जन्म तारीख/॥008: 17/03/2005

महिला/ FEMALE

£ Mobile No: 9247494851

2548 6021 4233

VID : 9186 8491 8819 2783
| माझे आधार, माझी ओळख

*/

text = `
= స A
hd >- కా
ab © GOVERNMENT OF INDIA™~ ౮ lal,

శ్వేత కులకర్ణి

Shweta Kulkami

जन्म तारीख/॥008: 17/03/2005

महिला/ FEMALE

£ Mobile No: 9247494851

2548 6021 4233

VID : 9186 8491 8819 2783
| माझे आधार, माझी ओळख 

`

function parseAadhaar(rawText) {

    const lines = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const result = {
        name: null,
        aadhaarNumber: null,
        dob: null,
        gender: null
    };

    // -------------------------------
    // Aadhaar Number
    // -------------------------------
    const aadhaarRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/;

    const aadhaarMatch = rawText.match(aadhaarRegex);

    if (aadhaarMatch) {
        result.aadhaarNumber = aadhaarMatch[0].replace(/[- ]/g, "");
    }

    // -------------------------------
    // DOB
    // -------------------------------
    const dobRegex =
        /(DOB|Date\s*of\s*Birth|Birth|जन्म\s*तारीख|जन्म\s*तिथि|Year\s*of\s*Birth|YOB)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})/i;

    const dobMatch = rawText.match(dobRegex);

    if (dobMatch) {
        result.dob = dobMatch[2];
    }

    // -------------------------------
    // Gender
    // -------------------------------
    const genderRegex =
        /\b(Male|Female|MALE|FEMALE|पुरुष|महिला)\b/i;

    const genderMatch = rawText.match(genderRegex);

    if (genderMatch) {
        result.gender = genderMatch[1];
    }

    // -------------------------------
    // Name
    // -------------------------------

    const blacklist = [
        "government",
        "india",
        "authority",
        "aadhaar",
        "dob",
        "birth",
        "male",
        "female",
        "address",
        "year",
        "uidai",
        "unique",
        "identification",
        "enrolment",
        "vid",
        "download"
    ];

    for (const line of lines) {

        if (/\d/.test(line)) continue;

        const lower = line.toLowerCase();

        if (blacklist.some(word => lower.includes(word))) continue;

        // Looks like an English name
        if (/^[A-Za-z.\s]{3,}$/.test(line)) {
            result.name = line;
            break;
        }
    }

    return result;
}


async function aadhaarParser(text) {
    const result = parseAadhaar(text);

    return result;

};

module.exports = {aadhaarParser};