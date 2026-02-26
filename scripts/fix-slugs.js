import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, '..', 'src', 'pages');
const imagesDir = path.join(__dirname, '..', 'public', 'images', 'articles');

// Files to exclude from processing
const excludeFiles = [
  'index.astro',
  'contact.astro',
  '[category].astro',
  'politica-de-confidentialitate.astro',
  'termeni-si-conditii.astro',
  'politica-cookies.astro'
];

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('Fixing slugs to use simple keyword...\n');

  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  const slugMap = {}; // old slug -> new slug

  // First pass: collect all slug changes
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract current slug and title
    const slugMatch = content.match(/slug:\s*"([^"]+)"/);
    const titleMatch = content.match(/title:\s*"([^"]+)"/);

    if (slugMatch && titleMatch) {
      const oldSlug = slugMatch[1];
      const title = titleMatch[1];
      const newSlug = slugify(title);

      if (oldSlug !== newSlug) {
        slugMap[oldSlug] = newSlug;
        console.log(`Will rename: ${file}`);
        console.log(`  Old slug: ${oldSlug}`);
        console.log(`  New slug: ${newSlug}`);
        console.log('');
      }
    }
  }

  if (Object.keys(slugMap).length === 0) {
    console.log('No slugs need to be changed.');
    return;
  }

  console.log(`\nApplying ${Object.keys(slugMap).length} slug changes...\n`);

  // Second pass: update all files
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    // Update slug in frontmatter
    const slugMatch = content.match(/slug:\s*"([^"]+)"/);
    if (slugMatch && slugMap[slugMatch[1]]) {
      const oldSlug = slugMatch[1];
      const newSlug = slugMap[oldSlug];

      // Update slug in frontmatter
      content = content.replace(
        `slug: "${oldSlug}"`,
        `slug: "${newSlug}"`
      );

      // Update image path
      content = content.replace(
        new RegExp(`/images/articles/${oldSlug}\\.webp`, 'g'),
        `/images/articles/${newSlug}.webp`
      );

      modified = true;
    }

    // Update related article links (old slugs -> new slugs)
    for (const [oldSlug, newSlug] of Object.entries(slugMap)) {
      if (content.includes(`href="/${oldSlug}/"`)) {
        content = content.replace(
          new RegExp(`href="/${oldSlug}/"`, 'g'),
          `href="/${newSlug}/"`
        );
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  // Third pass: rename files and images
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const slugMatch = content.match(/slug:\s*"([^"]+)"/);

    if (slugMatch) {
      const newSlug = slugMatch[1];
      const expectedFileName = `${newSlug}.astro`;

      if (file !== expectedFileName) {
        const oldFilePath = filePath;
        const newFilePath = path.join(pagesDir, expectedFileName);

        // Find old slug for image rename
        const oldSlug = Object.keys(slugMap).find(old => slugMap[old] === newSlug);

        if (oldSlug) {
          // Rename image if exists
          const oldImagePath = path.join(imagesDir, `${oldSlug}.webp`);
          const newImagePath = path.join(imagesDir, `${newSlug}.webp`);

          if (fs.existsSync(oldImagePath)) {
            fs.renameSync(oldImagePath, newImagePath);
            console.log(`Renamed image: ${oldSlug}.webp -> ${newSlug}.webp`);
          }
        }

        // Rename astro file
        fs.renameSync(oldFilePath, newFilePath);
        console.log(`Renamed file: ${file} -> ${expectedFileName}`);
      }
    }
  }

  console.log('\nDone! All slugs have been updated.');
}

main().catch(console.error);
