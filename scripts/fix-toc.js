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

function fixDuplicateToc(content) {
  // Remove section with "Cuprins" as title (duplicate TOC in content)
  // Pattern: section with h2 "Cuprins" followed by list or paragraphs
  const cuprinsSection = /<section id="sectiune-1" class="mb-10">\s*<h2 class="text-2xl font-bold text-slate-900 mb-4">Cuprins<\/h2>[\s\S]*?<\/section>/;

  if (cuprinsSection.test(content)) {
    content = content.replace(cuprinsSection, '');

    // Update sidebar TOC to remove the "Cuprins" link
    content = content.replace(
      /<a href="#sectiune-1" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">Cuprins<\/a>\s*/g,
      ''
    );

    // Renumber sections: sectiune-2 becomes sectiune-1, etc.
    for (let i = 2; i <= 10; i++) {
      const oldId = `sectiune-${i}`;
      const newId = `sectiune-${i - 1}`;
      content = content.replace(new RegExp(`id="${oldId}"`, 'g'), `id="${newId}"`);
      content = content.replace(new RegExp(`href="#${oldId}"`, 'g'), `href="#${newId}"`);
    }

    return { content, fixed: true };
  }

  return { content, fixed: false };
}

function makeCollapsibleToc(content) {
  // Replace the old sidebar TOC with a collapsible version
  const oldTocPattern = /<aside class="lg:col-span-1">\s*<div class="sticky top-24 bg-slate-50 rounded-xl p-6">\s*<h2 class="font-bold text-slate-900 mb-4 text-lg">Cuprins<\/h2>\s*<nav class="space-y-2">([\s\S]*?)<\/nav>\s*<\/div>\s*<\/aside>/;

  const match = content.match(oldTocPattern);
  if (!match) return content;

  const tocLinks = match[1];

  const newToc = `<aside class="lg:col-span-1">
          <div class="sticky top-24">
            <!-- Mobile TOC - Collapsible -->
            <div class="lg:hidden mb-6">
              <details class="bg-slate-50 rounded-xl overflow-hidden group" id="mobile-toc">
                <summary class="flex items-center justify-between cursor-pointer p-4 font-bold text-slate-900 hover:bg-slate-100 transition-colors">
                  <span class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                    Cuprins
                  </span>
                  <svg class="w-5 h-5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </summary>
                <nav class="p-4 pt-0 space-y-2 border-t border-slate-200">
${tocLinks.split('\n').map(line => '                ' + line.trim()).filter(l => l.trim()).join('\n')}
                </nav>
              </details>
            </div>

            <!-- Desktop TOC - Collapsible -->
            <div class="hidden lg:block">
              <details class="bg-slate-50 rounded-xl overflow-hidden group" open id="desktop-toc">
                <summary class="flex items-center justify-between cursor-pointer p-4 font-bold text-slate-900 hover:bg-slate-100 transition-colors">
                  <span class="flex items-center gap-2">
                    <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                    Cuprins
                  </span>
                  <svg class="w-5 h-5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </summary>
                <nav class="p-4 pt-2 space-y-2">
${tocLinks.split('\n').map(line => '                ' + line.trim()).filter(l => l.trim()).join('\n')}
                </nav>
              </details>
            </div>
          </div>
        </aside>`;

  return content.replace(oldTocPattern, newToc);
}

async function main() {
  console.log('Fixing TOC issues...\n');

  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  let fixedDuplicates = 0;
  let madeCollapsible = 0;

  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    // Step 1: Fix duplicate TOC
    const { content: fixedContent, fixed } = fixDuplicateToc(content);
    if (fixed) {
      content = fixedContent;
      console.log(`Fixed duplicate TOC: ${file}`);
      fixedDuplicates++;
      modified = true;
    }

    // Step 2: Make TOC collapsible
    const beforeCollapsible = content;
    content = makeCollapsibleToc(content);
    if (content !== beforeCollapsible) {
      console.log(`Made TOC collapsible: ${file}`);
      madeCollapsible++;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  console.log(`\nDone! Fixed ${fixedDuplicates} duplicate TOCs, made ${madeCollapsible} collapsible.`);
}

main().catch(console.error);
