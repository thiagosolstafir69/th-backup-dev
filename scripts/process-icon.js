const Jimp = require('jimp');
const path = require('path');

async function removeWhiteBackground() {
  const sourcePath =
    '/Users/thiago/.gemini/antigravity/brain/a058c1f8-ace9-4c55-9274-b8f286ccc5c3/backup_developer_source_for_transparency_1769622648541.png';
  const outputPath = path.join(__dirname, 'build', 'icon.png');

  const image = await Jimp.read(sourcePath);

  // Scramble through pixels and make white-ish pixels transparent
  // Apple squircle is centered, so we can also just mask it.
  // We'll use a simple color distance threshold.

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    // If pixel is very bright (near white), make it transparent
    if (r > 240 && g > 240 && b > 240) {
      this.bitmap.data[idx + 3] = 0;
    }
  });

  await image.writeAsync(outputPath);
  console.log('Icon processed and saved to:', outputPath);
}

removeWhiteBackground().catch(console.error);
