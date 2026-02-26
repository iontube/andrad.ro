import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, '..', 'src', 'pages');

const excludeFiles = [
  'index.astro',
  'contact.astro',
  '[category].astro',
  'politica-de-confidentialitate.astro',
  'termeni-si-conditii.astro',
  'politica-cookies.astro'
];

function parseFrontmatter(content) {
  const fm = {};
  const slugMatch = content.match(/slug:\s*"([^"]+)"/);
  const titleMatch = content.match(/title:\s*"([^"]+)"/);
  const categoryMatch = content.match(/category:\s*"([^"]+)"/);
  const categorySlugMatch = content.match(/categorySlug:\s*"([^"]+)"/);
  const imageMatch = content.match(/image:\s*"([^"]+)"/);

  if (slugMatch) fm.slug = slugMatch[1];
  if (titleMatch) fm.title = titleMatch[1];
  if (categoryMatch) fm.category = categoryMatch[1];
  if (categorySlugMatch) fm.categorySlug = categorySlugMatch[1];
  if (imageMatch) fm.image = imageMatch[1];

  return fm;
}

function generateRelatedSection(relatedArticles) {
  const cards = relatedArticles.map(article => `
            <a href="/${article.slug}/" class="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div class="aspect-video overflow-hidden">
                <img src="${article.image}" alt="${article.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              </div>
              <div class="p-4">
                <span class="text-xs font-medium text-primary-600">${article.category}</span>
                <h3 class="font-bold text-slate-900 mt-1 group-hover:text-primary-600 transition-colors line-clamp-2">${article.title}</h3>
              </div>
            </a>`).join('\n');

  return `
          <!-- Related Articles -->
          <section class="mt-12 pt-8 border-t border-slate-200">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Articole similare</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
${cards}
            </div>
          </section>`;
}

async function main() {
  console.log('Refreshing related articles with correct image paths...\n');

  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  // Collect all articles
  const articles = [];
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (fm.slug && fm.categorySlug) {
      articles.push({ file, filePath, ...fm });
    }
  }

  // Group by category
  const byCategory = {};
  for (const article of articles) {
    if (!byCategory[article.categorySlug]) {
      byCategory[article.categorySlug] = [];
    }
    byCategory[article.categorySlug].push(article);
  }

  let updated = 0;

  for (const article of articles) {
    let content = fs.readFileSync(article.filePath, 'utf-8');

    // Remove existing related section
    const relatedPattern = /\s*<!-- Related Articles -->[\s\S]*?<\/section>\s*(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/article>)/;
    content = content.replace(relatedPattern, '');

    // Also remove placeholder if exists
    content = content.replace('<!-- RELATED_ARTICLES_PLACEHOLDER -->', '');

    // Get related articles from same category
    const categoryArticles = byCategory[article.categorySlug].filter(a => a.slug !== article.slug);

    if (categoryArticles.length === 0) continue;

    // Select up to 3 random articles
    const shuffled = categoryArticles.sort(() => Math.random() - 0.5);
    const relatedArticles = shuffled.slice(0, 3);

    // Generate new related section
    const relatedSection = generateRelatedSection(relatedArticles);

    // Insert before closing </div> of prose-custom
    const insertPattern = /(<\/section>\s*)(<\/div>\s*<\/div>\s*<\/div>\s*<\/article>)/;

    if (insertPattern.test(content)) {
      content = content.replace(insertPattern, `$1${relatedSection}\n        $2`);
      fs.writeFileSync(article.filePath, content);
      console.log(`Updated: ${article.file}`);
      updated++;
    }
  }

  console.log(`\nDone! Updated ${updated} articles.`);
}

main().catch(console.error);
