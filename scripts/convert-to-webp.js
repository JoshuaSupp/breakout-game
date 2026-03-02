const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = path.join(__dirname, '../src/assets/images/background');

console.log(`Scanning directory: ${inputDir}`);

if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
}

fs.readdir(inputDir, (err, files) => {
    if (err) {
        console.error('Error reading directory:', err);
        return;
    }

    let count = 0;
    files.forEach(file => {
        if (file.match(/\.(jpg|jpeg|png)$/i)) {
            const inputFile = path.join(inputDir, file);
            const outputFile = path.join(inputDir, path.parse(file).name + '.webp');

            sharp(inputFile)
                .webp({ quality: 80 })
                .toFile(outputFile)
                .then(info => {
                    console.log(`Converted ${file} to WebP`);
                })
                .catch(err => {
                    console.error(`Error converting ${file}:`, err);
                });
            count++;
        }
    });
    
    if (count === 0) {
        console.log('No JPG/PNG files found to convert.');
    } else {
        console.log(`Found ${count} files to convert...`);
    }
});
