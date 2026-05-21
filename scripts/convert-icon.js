const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function convertSvgToPng() {
  const svgPath = path.join(__dirname, '..', 'icon-new.svg');
  const pngPath = path.join(__dirname, '..', 'build', 'icon.png');
  const transparentPngPath = path.join(__dirname, '..', 'build', 'icon_transparent.png');

  // Check if SVG exists
  if (!fs.existsSync(svgPath)) {
    console.error('SVG file not found:', svgPath);
    return;
  }

  // Read SVG
  const svgBuffer = fs.readFileSync(svgPath);

  // Convert to PNG at 1024x1024
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(pngPath);

  console.log('PNG saved to:', pngPath);

  // Also create a transparent version
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(transparentPngPath);

  console.log('Transparent PNG saved to:', transparentPngPath);
}

convertSvgToPng().catch(console.error);
