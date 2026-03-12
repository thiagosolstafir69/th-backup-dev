const Jimp = require('jimp');
const path = require('path');

async function createAppleSquircleIcon() {
  const sourcePath = '/Users/thiago/.gemini/antigravity/brain/a058c1f8-ace9-4c55-9274-b8f286ccc5c3/backup_developer_source_for_transparency_1769622648541.png';
  const outputPath = path.join(__dirname, '..', 'build', 'icon.png');

  const image = await Jimp.read(sourcePath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  // Create a mask with the same dimensions
  const mask = new Jimp(width, height, 0x00000000); // Fully transparent black
  
  // Draw a rounded rectangle (squircle-like) on the mask
  // Modern macOS icons use a specific squircle, but a high-radius rounded rect is close.
  // We'll approximate the Big Sur icon shape.
  const radius = width * 0.225; // Standard Apple icon radius is approx 22.5% of width
  
  // We'll use a scanning approach to create the mask for perfect alignment
  // Based on the source image, the icon is roughly from 10% to 90% in both axes.
  const padding = width * 0.08; // Roughly the padding in the generated image
  const size = width - (padding * 2);
  
  // Helper to check if a point is inside a rounded rectangle
  function isInside(x, y, rectX, rectY, rectW, rectH, r) {
    // Check main body
    if (x >= rectX + r && x <= rectX + rectW - r && y >= rectY && y <= rectY + rectH) return true;
    if (x >= rectX && x <= rectX + rectW && y >= rectY + r && y <= rectY + rectH - r) return true;
    
    // Check corners
    const corners = [
        [rectX + r, rectY + r],
        [rectX + rectW - r, rectY + r],
        [rectX + r, rectY + rectH - r],
        [rectX + rectW - r, rectY + rectH - r]
    ];
    
    for (const [cx, cy] of corners) {
        if (Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2)) <= r) return true;
    }
    return false;
  }

  mask.scan(0, 0, width, height, function(x, y, idx) {
    if (isInside(x, y, padding, padding, size, size, radius)) {
        this.bitmap.data[idx + 3] = 255; // Opaque
    }
  });

  // Apply the mask to the original image
  image.mask(mask, 0, 0);

  await image.writeAsync(outputPath);
  console.log('Processed icon with perfect corner transparency saved to:', outputPath);
}

createAppleSquircleIcon().catch(console.error);
