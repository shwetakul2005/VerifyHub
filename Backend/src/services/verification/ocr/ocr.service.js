const Tesseract = require("tesseract.js");


async function extractText(imagePath){
    // const imagePath = "./ocr/driving-licenses.png";
    const result = await Tesseract.recognize(
        imagePath,
        "eng+mar+tel"
    );
    // console.log(result);

    return result.data.text;
}

module.exports = {
    extractText
};