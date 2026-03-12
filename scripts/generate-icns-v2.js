const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'build', 'icon.png');
const dest = path.join(__dirname, '..', 'build', 'app-icon.icns');

console.log('Reading source icon:', source);
const input = fs.readFileSync(source);

console.log('Generating ICNS...');
const output = png2icons.createICNS(input, png2icons.BICUBIC2, 0);

if (output) {
  fs.writeFileSync(dest, output);
  console.log('ICNS generated successfully:', dest);
  console.log('Size:', output.length, 'bytes');
} else {
  console.error('Failed to generate ICNS - output is null. The source PNG may be invalid.');
  process.exit(1);
}
