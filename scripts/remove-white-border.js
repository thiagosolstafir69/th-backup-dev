const sharp = require('sharp');
const path = require('path');

const sourcePath =
  '/Users/thiago/.gemini/antigravity/brain/a058c1f8-ace9-4c55-9274-b8f286ccc5c3/backup_developer_flat_icon_no_bg_1769622482165.png';
const outputPath = path.join(__dirname, '..', 'build', 'icon_transparent.png');

async function removeWhiteBorder() {
  console.log('Processing icon to remove white borders...');

  // Read the image
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  console.log(`Image size: ${width}x${height}`);

  // Get raw pixel data
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  // Create a new buffer for the output with alpha channel
  const outputData = Buffer.alloc(width * height * 4);

  // Check if source has alpha
  const hasAlpha = info.channels === 4;
  const bytesPerPixel = info.channels;

  // Threshold for "white" detection (pixels with R, G, B all > 250)
  const WHITE_THRESHOLD = 250;

  // Function to check if a pixel is "white" (or very close to white)
  function isWhite(r, g, b) {
    return r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD;
  }

  // Create a visited array for flood fill
  const visited = new Uint8Array(width * height);
  const toMakeTransparent = new Set();

  // Flood fill from corners to find all white pixels connected to edges
  function floodFill(startX, startY) {
    const stack = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop();

      if (x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }

      const idx = y * width + x;
      if (visited[idx]) {
        continue;
      }
      visited[idx] = 1;

      const pixelIdx = idx * bytesPerPixel;
      const r = data[pixelIdx];
      const g = data[pixelIdx + 1];
      const b = data[pixelIdx + 2];

      if (isWhite(r, g, b)) {
        toMakeTransparent.add(idx);
        // Add neighbors
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }
    }
  }

  // Start flood fill from all edges
  console.log('Flood filling from edges...');
  for (let x = 0; x < width; x++) {
    floodFill(x, 0); // Top edge
    floodFill(x, height - 1); // Bottom edge
  }
  for (let y = 0; y < height; y++) {
    floodFill(0, y); // Left edge
    floodFill(width - 1, y); // Right edge
  }

  console.log(`Found ${toMakeTransparent.size} edge-connected white pixels to make transparent`);

  // Copy pixels to output, making edge-connected white pixels transparent
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const srcIdx = idx * bytesPerPixel;
      const dstIdx = idx * 4;

      outputData[dstIdx] = data[srcIdx]; // R
      outputData[dstIdx + 1] = data[srcIdx + 1]; // G
      outputData[dstIdx + 2] = data[srcIdx + 2]; // B

      if (toMakeTransparent.has(idx)) {
        outputData[dstIdx + 3] = 0; // Transparent
      } else {
        outputData[dstIdx + 3] = hasAlpha ? data[srcIdx + 3] : 255; // Original alpha or opaque
      }
    }
  }

  // Save the result
  await sharp(outputData, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png()
    .toFile(outputPath);

  console.log('Done! Saved to:', outputPath);
}

removeWhiteBorder().catch(console.error);
