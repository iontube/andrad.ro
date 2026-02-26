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

function fixMarkdownFormatting(content) {
  // Fix null headings - replace with "Introducere" for section 1
  content = content.replace(/<h2 class="text-2xl font-bold text-slate-900 mb-4">null<\/h2>/g,
    '<h2 class="text-2xl font-bold text-slate-900 mb-4">Introducere</h2>');

  // Fix null in cuprins links
  content = content.replace(/<a href="#sectiune-1" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">null<\/a>/g,
    '<a href="#sectiune-1" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">Introducere</a>');

  // Convert markdown bold **text** to <strong>text</strong>
  // This regex handles bold text that may span part of a paragraph
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert markdown italic *text* to <em>text</em> (but not list items)
  // Only match single asterisks that are not part of list items (not preceded by whitespace + *)
  content = content.replace(/(?<!\*)\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, '<em>$1</em>');

  // Convert markdown list items to proper HTML lists
  // First, find consecutive paragraphs that are list items
  const listItemPattern = /<p class="mb-4">\*\s+(.+?)<\/p>/g;

  // Find all list item groups and convert them
  let lastIndex = 0;
  let result = '';
  let inList = false;
  let listItems = [];

  const lines = content.split('\n');
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/<p class="mb-4">\*\s+(.+?)<\/p>/);

    if (listMatch) {
      if (!inList) {
        inList = true;
        listItems = [];
      }
      // Extract the list item content and fix any nested bold
      let itemContent = listMatch[1].trim();
      listItems.push(itemContent);
    } else {
      if (inList) {
        // End of list, output the accumulated list items
        processedLines.push('    <ul class="list-disc list-inside mb-4 space-y-2">');
        for (const item of listItems) {
          processedLines.push(`      <li>${item}</li>`);
        }
        processedLines.push('    </ul>');
        inList = false;
        listItems = [];
      }
      processedLines.push(line);
    }
  }

  // Handle list at end of content
  if (inList && listItems.length > 0) {
    processedLines.push('    <ul class="list-disc list-inside mb-4 space-y-2">');
    for (const item of listItems) {
      processedLines.push(`      <li>${item}</li>`);
    }
    processedLines.push('    </ul>');
  }

  return processedLines.join('\n');
}

async function main() {
  console.log('Starting formatting fix...\n');

  const files = fs.readdirSync(pagesDir).filter(f =>
    f.endsWith('.astro') && !excludeFiles.includes(f)
  );

  let fixedCount = 0;
  let issuesFound = 0;

  for (const file of files) {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if file has formatting issues
    const hasNullHeading = content.includes('>null</h2>') || content.includes('>null</a>');
    const hasMarkdownBold = /\*\*[^*]+\*\*/.test(content);
    const hasMarkdownList = /<p class="mb-4">\*\s+/.test(content);

    if (hasNullHeading || hasMarkdownBold || hasMarkdownList) {
      console.log(`Fixing: ${file}`);
      if (hasNullHeading) console.log('  - Found null headings');
      if (hasMarkdownBold) console.log('  - Found markdown bold');
      if (hasMarkdownList) console.log('  - Found markdown lists');

      const fixedContent = fixMarkdownFormatting(content);
      fs.writeFileSync(filePath, fixedContent);

      fixedCount++;
      issuesFound += (hasNullHeading ? 1 : 0) + (hasMarkdownBold ? 1 : 0) + (hasMarkdownList ? 1 : 0);
    }
  }

  console.log(`\nDone! Fixed ${fixedCount} files with ${issuesFound} issue types.`);
}

main().catch(console.error);
