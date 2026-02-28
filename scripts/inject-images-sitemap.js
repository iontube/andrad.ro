#!/usr/bin/env node

/**
 * Inject image tags into Astro's sitemap-0.xml
 * Adds <image:image> for each article that has an image in dist/images/articles/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const SITEMAP_PATH = path.join(DIST_DIR, 'sitemap-0.xml');
const IMAGES_DIR = path.join(DIST_DIR, 'images', 'articles');

if (!fs.existsSync(SITEMAP_PATH)) {
  console.log('No sitemap-0.xml found, skipping image injection.');
  process.exit(0);
}

let xml = fs.readFileSync(SITEMAP_PATH, 'utf-8');

// Add image namespace if not present
if (!xml.includes('xmlns:image')) {
  xml = xml.replace(
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
  );
}

// For each <url><loc>...</loc></url>, check if there's a matching image
let injected = 0;
xml = xml.replace(/<url><loc>(https?:\/\/[^<]+)<\/loc><\/url>/g, (match, loc) => {
  // Extract slug from URL
  const urlPath = new URL(loc).pathname.replace(/^\/|\/$/g, '');
  if (!urlPath || urlPath.includes('/')) return match; // skip homepage, categories etc.

  const imagePath = path.join(IMAGES_DIR, `${urlPath}.webp`);
  if (fs.existsSync(imagePath)) {
    const siteUrl = loc.replace(/\/[^/]+\/$/, '');
    injected++;
    return `<url><loc>${loc}</loc><image:image><image:loc>${siteUrl}/${urlPath}/../../images/articles/${urlPath}.webp</image:loc></image:image></url>`
      .replace(`${siteUrl}/${urlPath}/../../images/articles/${urlPath}.webp`, `${new URL(loc).origin}/images/articles/${urlPath}.webp`);
  }
  return match;
});

fs.writeFileSync(SITEMAP_PATH, xml, 'utf-8');
console.log(`Injected images into sitemap-0.xml: ${injected} articles`);
