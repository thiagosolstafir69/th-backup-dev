const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const iconSetDir = path.join(buildDir, 'icon.iconset');
const sourceIcon = path.join(buildDir, 'icon.png');

if (!fs.existsSync(iconSetDir)) {
  fs.mkdirSync(iconSetDir);
}

const sizes = [16, 32, 64, 128, 256, 512, 1024];

sizes.forEach(size => {
  const filename = `icon_${size}x${size}.png`;
  const filepath = path.join(iconSetDir, filename);
  console.log(`Creating ${filename}...`);
  execSync(`sips -z ${size} ${size} "${sourceIcon}" --out "${filepath}"`);
  
  if (size < 1024) {
      const doubleSize = size * 2;
      const filename2x = `icon_${size}x${size}@2x.png`;
      const filepath2x = path.join(iconSetDir, filename2x);
      console.log(`Creating ${filename2x}...`);
      execSync(`sips -z ${doubleSize} ${doubleSize} "${sourceIcon}" --out "${filepath2x}"`);
  }
});

console.log('Generating .icns file...');
try {
    execSync(`iconutil -c icns "${iconSetDir}"`);
    console.log('icon.icns generated successfully in build/');
} catch (e) {
    console.error('Failed to generate icns:', e.message);
}

// Clean up
fs.rmSync(iconSetDir, { recursive: true, force: true });
