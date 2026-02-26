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

// Parse frontmatter from article content
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/export const frontmatter = \{([^}]+)\}/s);
  if (!frontmatterMatch) return null;

  const fm = {};
  const lines = frontmatterMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(/(\w+):\s*["'](.+?)["']/);
    if (match) {
      fm[match[1]] = match[2];
    }
  }
  return fm;
}

// Generate related articles HTML section
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
  console.log('Adding related articles sections...\n');

  // First, collect all articles and their metadata
  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  const articles = [];
  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (fm && fm.slug && fm.categorySlug) {
      articles.push({
        file,
        filePath,
        ...fm
      });
    }
  }

  console.log(`Found ${articles.length} articles\n`);

  // Group articles by category
  const byCategory = {};
  for (const article of articles) {
    if (!byCategory[article.categorySlug]) {
      byCategory[article.categorySlug] = [];
    }
    byCategory[article.categorySlug].push(article);
  }

  // Process each article
  let updatedCount = 0;
  for (const article of articles) {
    const content = fs.readFileSync(article.filePath, 'utf-8');

    // Skip if already has related articles section
    if (content.includes('Articole similare')) {
      console.log(`Skipping ${article.file} - already has related articles`);
      continue;
    }

    // Get other articles from same category
    const categoryArticles = byCategory[article.categorySlug].filter(a => a.slug !== article.slug);

    if (categoryArticles.length === 0) {
      console.log(`Skipping ${article.file} - no other articles in category`);
      continue;
    }

    // Select up to 3 random articles
    const shuffled = categoryArticles.sort(() => Math.random() - 0.5);
    const relatedArticles = shuffled.slice(0, 3);

    // Generate the related section HTML
    const relatedSection = generateRelatedSection(relatedArticles);

    // Try to replace placeholder first (for new articles)
    let newContent;
    if (content.includes('<!-- RELATED_ARTICLES_PLACEHOLDER -->')) {
      newContent = content.replace('<!-- RELATED_ARTICLES_PLACEHOLDER -->', relatedSection);
    } else {
      // Fallback: Insert before the closing </div> of prose-custom (after FAQ section)
      const insertPattern = /(<\/section>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/article>)/;

      if (!insertPattern.test(content)) {
        console.log(`Skipping ${article.file} - couldn't find insertion point`);
        continue;
      }

      newContent = content.replace(insertPattern, `</section>${relatedSection}
        </div>
      </div>
    </div>
  </article>`);
    }

    fs.writeFileSync(article.filePath, newContent);
    console.log(`Updated: ${article.file} (${relatedArticles.length} related articles)`);
    updatedCount++;
  }

  console.log(`\nDone! Updated ${updatedCount} articles.`);
}

main().catch(console.error);
