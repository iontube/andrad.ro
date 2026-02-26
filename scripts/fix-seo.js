import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, '..', 'src', 'pages');

// Files to exclude from processing
const excludeFiles = [
  'index.astro',
  'contact.astro',
  '[category].astro',
  'politica-de-confidentialitate.astro',
  'termeni-si-conditii.astro',
  'politica-cookies.astro'
];

function extractFirstParagraph(content) {
  // Find first <p class="mb-4"> content
  const match = content.match(/<p class="mb-4">([^<]+)<\/p>/);
  if (match) {
    let text = match[1].replace(/<[^>]+>/g, '').trim();
    // Truncate to 160 chars for meta description
    if (text.length > 160) {
      text = text.substring(0, 157) + '...';
    }
    return text;
  }
  return null;
}

function updateLayoutCall(content) {
  // Check if Layout already has the new props
  if (content.includes('author={frontmatter.author}')) {
    return { content, updated: false };
  }

  // Find the Layout component call and add new props
  const layoutPattern = /<Layout\s+title=\{frontmatter\.title\}\s+description=\{frontmatter\.excerpt\}\s+canonical=\{`\/\$\{frontmatter\.slug\}\/`\}\s+type="article"\s+image=\{frontmatter\.image\}/;

  if (layoutPattern.test(content)) {
    content = content.replace(
      layoutPattern,
      `<Layout
  title={frontmatter.title}
  description={frontmatter.excerpt}
  canonical={\`/\${frontmatter.slug}/\`}
  type="article"
  image={frontmatter.image}
  author={frontmatter.author}
  category={frontmatter.category}
  categorySlug={frontmatter.categorySlug}
  publishDate={frontmatter.publishDate}`
    );
    return { content, updated: true };
  }

  return { content, updated: false };
}

function fixExcerpt(content) {
  // Extract frontmatter excerpt
  const excerptMatch = content.match(/excerpt:\s*"([^"]+)"/);
  if (!excerptMatch) return { content, fixed: false };

  const currentExcerpt = excerptMatch[1];

  // Check if excerpt is bad (generic or too short)
  const badExcerpts = [
    'Iată o privire rapidă',
    'Cuprins',
    'Lista cu toate',
    'subiectelor pe care'
  ];

  const isBad = badExcerpts.some(bad => currentExcerpt.includes(bad)) || currentExcerpt.length < 50;

  if (isBad) {
    const newExcerpt = extractFirstParagraph(content);
    if (newExcerpt && newExcerpt.length > 50) {
      content = content.replace(
        /excerpt:\s*"[^"]+"/,
        `excerpt: "${newExcerpt.replace(/"/g, '\\"')}"`
      );
      return { content, fixed: true, newExcerpt };
    }
  }

  return { content, fixed: false };
}

async function main() {
  console.log('Fixing SEO issues in articles...\n');

  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  let layoutUpdated = 0;
  let excerptFixed = 0;

  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    // Update Layout call with new props
    const layoutResult = updateLayoutCall(content);
    if (layoutResult.updated) {
      content = layoutResult.content;
      console.log(`Updated Layout props: ${file}`);
      layoutUpdated++;
      modified = true;
    }

    // Fix bad excerpts
    const excerptResult = fixExcerpt(content);
    if (excerptResult.fixed) {
      content = excerptResult.content;
      console.log(`Fixed excerpt: ${file}`);
      console.log(`  New: ${excerptResult.newExcerpt?.substring(0, 60)}...`);
      excerptFixed++;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  console.log(`\nDone!`);
  console.log(`Layout props updated: ${layoutUpdated}`);
  console.log(`Excerpts fixed: ${excerptFixed}`);
}

main().catch(console.error);
