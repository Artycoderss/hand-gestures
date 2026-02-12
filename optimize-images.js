import imagemin from 'imagemin';
import imageminWebp from 'imagemin-webp';
import { promises as fs } from 'fs';

const sourceDir = 'src/assets/images';
const destDir = 'src/assets/images/webp';

async function optimizeImages() {
  // Ensure the destination directory exists
  await fs.mkdir(destDir, { recursive: true });

  // Optimize images and save to destination directory
  await imagemin([`${sourceDir}/*.{jpg,png}`], {
    destination: destDir,
    plugins: [imageminWebp({ quality: 80 })],
  });

  console.log('Images optimized');
}

optimizeImages().catch((error) =>
  console.error('Error optimizing images:', error),
);
