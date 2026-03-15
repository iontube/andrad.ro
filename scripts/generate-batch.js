#!/usr/bin/env node

/**
 * Generate a batch of articles from temp-articles.json
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.join(__dirname, '..');

// Load .env for standalone usage
import { readFileSync, existsSync } from 'fs';
try {
  const envContent = readFileSync(path.join(projectDir, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0 && !process.env[key.trim()]) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
} catch (e) {}

// ========== CONFIG ==========
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || '').split(',').filter(Boolean);

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

let currentKeyIndex = 0;
let currentAuthorIndex = 0;

const AUTHORS = [
  'Alexandru Popescu',
  'Maria Ionescu',
  'Andrei Dumitrescu',
  'Elena Marinescu',
  'Cristian Gheorghe',
  'Ana Popa',
  'Mihai Stanescu',
  'Ioana Florescu'
];

function getNextApiKey() {
  const key = GEMINI_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
  return key;
}

function getNextAuthor() {
  const author = AUTHORS[currentAuthorIndex];
  currentAuthorIndex = (currentAuthorIndex + 1) % AUTHORS.length;
  return author;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Escape quotes for safe use in templates
function escapeForTemplate(str) {
  return str
    .replace(/"/g, '') // Remove double quotes
    .replace(/"/g, '') // Remove smart quotes
    .replace(/"/g, '') // Remove smart quotes
    .replace(/„/g, '') // Remove Romanian quotes
    .replace(/'/g, "'") // Normalize single quotes
    .trim();
}

function stripStrong(str) {
  return str.replace(/<\/?strong>/g, '');
}

function stripFakeLinks(html, pagesDir) {
  return html.replace(/<a\s+href="\/([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, linkPath, text) => {
    const slug = linkPath.replace(/\/$/, '');
    if (existsSync(path.join(pagesDir, `${slug}.astro`))) return match;
    if (existsSync(path.join(pagesDir, slug))) return match;
    return text;
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== TRANSLATE TO ENGLISH ==========
async function translateToEnglish(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Translate the following Romanian text to English. Return ONLY the English translation, nothing else:\n\n${text}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
      console.error(`  Translation attempt ${attempt + 1} failed: no candidates`);
    } catch (error) {
      console.error(`  Translation attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return text;
}

// ========== GENERATE IMAGE ==========

// Strip brand names from image prompt to avoid Cloudflare AI content filter
function stripBrands(text) {
  return text
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, '')  // camelCase brands: HyperX, PlayStation
    .replace(/\b[A-Z]{2,}\b/g, '')            // ALL CAPS: ASUS, RGB, LED
    .replace(/\s{2,}/g, ' ')                   // collapse double spaces
    .trim();
}

// Use Gemini to rephrase a title into a generic description without brand names
async function rephraseWithoutBrands(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Rephrase the following into a short, generic English description for an image prompt. Remove ALL brand names, trademarks, product names, and game names. Replace them with generic descriptions of what they are. Return ONLY the rephrased text, nothing else.\n\nExample: "Boggle classic word game" -> "classic letter dice word game on a table"\nExample: "Kindle Paperwhite review" -> "slim e-reader device with paper-like screen"\nExample: "Duolingo app for learning languages" -> "colorful language learning mobile app interface"\n\nText: "${text}"` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Rephrased prompt (no brands): ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Rephrase attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback to basic stripBrands
  return stripBrands(text);
}

// Use Gemini to create a maximally safe image prompt, avoiding people/brands entirely
async function generateSafePrompt(text, categorySlug) {
  const categoryFallbacks = {
    'foto-video': 'a modern camera on a clean desk with soft studio lighting and minimalist background',
    'smart-home': 'smart home devices arranged on a shelf in a contemporary living room with ambient lighting',
    'tehnologie-gaming': 'gaming peripherals and devices on a dark desk with subtle RGB glow',
    'electrocasnice': 'modern kitchen appliances on a clean countertop with soft natural lighting',
    'tv-audio': 'a sleek television and audio equipment in a stylish living room with warm lighting',
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a short, safe English image prompt for a stock photo related to this topic. The prompt must describe ONLY objects, scenery, and atmosphere. NEVER mention people, children, babies, faces, hands, or any human body parts. NEVER use brand names. Focus on products, objects, books, devices, furniture, or abstract scenes. Return ONLY the description.\n\nTopic: "${text}"` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Safe prompt generated: ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Safe prompt attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback to hardcoded category description
  return categoryFallbacks[categorySlug] || 'modern technology devices and accessories arranged on a clean minimalist desk';
}

async function generateImage(imagePrompt, slug, categorySlug) {
  const categoryPrompts = {
    'foto-video': 'on a clean desk setup with soft studio lighting, modern workspace, minimalist background',
    'smart-home': 'in a modern smart home interior, ambient LED lighting, contemporary minimalist living room',
    'tehnologie-gaming': 'on a modern desk setup with RGB lighting, gaming atmosphere, dark background with subtle tech glow',
    'electrocasnice': 'in a modern kitchen or home interior, clean contemporary setting, soft natural lighting',
    'tv-audio': 'in a stylish modern living room, cinematic atmosphere, clean contemporary interior design',
  };

  console.log(`  Generating image for: ${imagePrompt}`);

  const MAX_IMAGE_RETRIES = 4;
  let promptFlagged = false;

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {

    if (attempt > 1) {

      console.log(`  Image retry attempt ${attempt}/${MAX_IMAGE_RETRIES}...`);

      await new Promise(r => setTimeout(r, 3000 * attempt));

    }


  try {
    let prompt;
    if (attempt >= 3) {
      const safeSubject = await generateSafePrompt(imagePrompt, categorySlug);
      prompt = `Realistic photograph of ${safeSubject}, no text, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional photography.`;
      console.log(`  Using safe prompt (attempt ${attempt}): ${prompt}`);
    } else {
      const titleEn = await translateToEnglish(imagePrompt);
      console.log(`  Translated title: ${titleEn}`);

      const setting = categoryPrompts[categorySlug] || 'in a modern home setting, soft natural lighting, clean contemporary background';
      const subject = promptFlagged ? await rephraseWithoutBrands(titleEn) : titleEn;
      prompt = `Realistic photograph of ${subject} ${setting}, no text, no brand name, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional product photography.`;
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('steps', '20');
    formData.append('width', '1024');
    formData.append('height', '768');

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-dev`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  Image API error: ${response.status} - ${errorText.slice(0, 200)}`);
      if (errorText.includes('flagged')) promptFlagged = true;
      continue;
    }

    const data = await response.json();
    if (!data.result?.image) {
      console.error('  No image in response');
      continue;
    }

    const imageBuffer = Buffer.from(data.result.image, 'base64');
    const imagePath = await downloadAndCompressImage(imageBuffer, slug);
    return imagePath;
  } catch (error) {
    console.error(`  Image generation error: ${error.message}`);
    continue;
  }


  }

  console.error('  Image generation failed after all retries');

  return null;
}

async function downloadAndCompressImage(imageBuffer, slug) {
  const imagesDir = path.join(projectDir, 'public', 'images', 'articles');
  await fs.mkdir(imagesDir, { recursive: true });

  const imagePath = path.join(imagesDir, `${slug}.webp`);
  const publicPath = `/images/articles/${slug}.webp`;

  await sharp(imageBuffer)
    .resize(800, 600, { fit: 'cover' })
    .webp({ quality: 82, effort: 6 })
    .toFile(imagePath);

  console.log(`  Image saved: ${publicPath}`);
  return publicPath;
}

// ========== GENERATE ARTICLE CONTENT ==========
async function generateArticleContent(keyword, category, completedArticles = []) {
  
  // Build interlink list from completed articles
  const currentSlug = keyword.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const interlinkCandidates = completedArticles
    .filter(a => a.keyword !== keyword)
    .map(a => {
      const aSlug = a.keyword.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return { title: a.keyword.charAt(0).toUpperCase() + a.keyword.slice(1), slug: aSlug, category: a.category, categorySlug: a.categorySlug };
    });
  // Prioritize same category, then others, max 15
  const sameCategory = interlinkCandidates.filter(a => a.categorySlug === completedArticles.find(c => c.keyword === keyword)?.categorySlug);
  const otherCategory = interlinkCandidates.filter(a => !sameCategory.includes(a));
  const interlinkList = [...sameCategory, ...otherCategory].slice(0, 15)
    .map(a => `- <a href="/${a.slug}/">${a.title}</a> (categorie: ${a.category})`)
    .join('\n');

const prompt = `Scrii articole pe un site romanesc despre telefoane, tablete, gadgeturi si accesorii tech. Stilul e informativ dar directionat spre conversie - ajuti cititorul sa ia o decizie de cumparare. NU esti un AI.

Keyword: "${keyword}"
Categorie: "${category}"

=== TONUL SI STILUL ===

INTRO:
- Prima propozitie = raspunsul direct la intentia de cautare. Fara preambul, fara "bun venit".
- Scrie ca un prieten care se pricepe la tech si iti zice direct ce sa iei.

REVIEW-URI PRODUSE:
- Fiecare produs descris onest: puncte tari si slabe reale.
- Include specificatii concrete (procesor, display, baterie, camera).
- Preturi realiste in lei, piata Romania 2026.
- Anecdote personale: "am testat modelul asta vreo 3 saptamani", "un prieten si-a luat un Y si dupa 2 luni..."

CONVERSIE:
- Ajuta cititorul sa decida: "daca vrei X, ia modelul A; daca bugetul e mai mic, modelul B face treaba"
- Fiecare produs sa aiba o concluzie scurta: pentru cine e potrivit si de ce

=== ANTI-AI (FOARTE IMPORTANT) ===
Cuvinte si expresii INTERZISE - NU le folosi niciodata:
"Asadar", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Trebuie sa tinem cont", "Nu in ultimul rand", "In primul rand", "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta"

INTERZIS: liste de 3 adjective consecutive, doua propozitii la rand cu acelasi cuvant, acelasi pattern de inceput de paragraf.

Foloseste limbaj conversational romanesc: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "bon, stai", "ma rog", "zic si eu", "uite care-i treaba"
Amesteca propozitii scurte (3-5 cuvinte) cu propozitii lungi (18-22 cuvinte). Paragrafele sa varieze: 1-2 propozitii, apoi 3-4, apoi 2.
Include critici oneste si recunoaste incertitudine: "n-am testat personal, dar din ce am auzit..."

=== PARAGRAFE CU INTREBARI ===
In textul review-urilor si al ghidului, pune intrebari retorice naturale ca sub-titluri sau in text:
"Dar merita pretul?" / "Ce primesti la banii astia?" / "Cum se descurca la camera?"
Asta optimizeaza pentru AI search (Perplexity, SGE) care cauta raspunsuri la intrebari concrete.

=== STRUCTURA JSON ===
Returneaza DOAR JSON valid, fara markdown, fara \`\`\`:
{
  "intro": "2-3 propozitii HTML (<p>) care dau raspunsul direct. Recomandarea ta + context scurt. Asta apare ca snippet in Google.",
  "items": [
    {
      "name": "Numele complet al produsului",
      "specs": {
        "procesor": "ex: Snapdragon 8 Gen 3 / Apple A17 Pro",
        "display": "ex: 6.7 inch AMOLED 120Hz, 2778x1284px",
        "ram": "ex: 8GB LPDDR5X",
        "stocare": "ex: 256GB UFS 4.0",
        "baterie": "ex: 5000mAh, incarcare rapida 67W",
        "camera": "ex: 200MP principal + 12MP ultrawide + 10MP tele 3x"
      },
      "review": "HTML (<p>, <strong>, <ul>/<li>) cu review-ul produsului. Minim 150 cuvinte. Paragrafele scurte, max 3-4 propozitii.",
      "pros": ["avantaj 1", "avantaj 2", "avantaj 3"],
      "cons": ["dezavantaj real 1", "dezavantaj real 2"]
    }
  ],
  "comparison": {
    "heading": "Titlu comparatie cu keyword integrat natural",
    "rows": [
      {"model":"...", "procesor":"...", "display":"...", "baterie":"...", "camera":"...", "potrivitPentru":"..."}
    ]
  },
  "guide": {
    "heading": "Titlu ghid cumparare cu keyword",
    "content": "HTML (<p>, <h4>, <ul>/<li>) cu ghid de cumparare: criterii, sfaturi, greseli de evitat. Minim 300 cuvinte."
  },
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct. Apoi 1-2 propozitii cu detalii si cifre. Total 40-70 cuvinte."
    }
  ]
}

=== CERINTE PRODUSE ===
- 5-7 produse reale, existente pe piata
- Specificatii REALE, nu inventate - verifica procesor, display, RAM, stocare, baterie, camera
- Preturi in lei, realiste pentru Romania 2026
- Pros/cons oneste - fiecare produs minim 2 cons-uri reale
- Review HTML cu paragrafe scurte, intrebari retorice, limbaj conversational

=== CERINTE FAQ ===
- 5 intrebari naturale, formulari de cautare Google reale
- Raspunsuri cu structura featured snippet: raspuns direct + detalii cu cifre
- Acoperiti: pret, comparatie, durabilitate, alegere, probleme frecvente

=== REGULI ===
- Scrie FARA diacritice (fara a, i, s, t, a - foloseste a, i, s, t, a)
- Preturile in LEI, realiste piata Romania 2026
- Keyword-ul "${keyword}" in <strong> de 4-6 ori in tot articolul, doar in <p>, NU in headings/FAQ
- NICIODATA <strong> in titluri, intrebari FAQ, sau cuprins

${interlinkList.length > 0 ? `
=== INTERLINK-URI INTERNE (SEO) ===
Mentioneaza NATURAL in text 2-4 articole de pe site, cu link-uri <a href="/{slug}/">{titlu}</a>.
Integreaza in propozitii, NU ca lista separata. Max 4 link-uri. Doar unde are sens contextual.
NU forta link-uri daca nu au legatura cu subiectul. Mai bine 0 link-uri decat link-uri fortate.

Articole disponibile:
${interlinkList}` : ''}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      console.log(`  Generating content (attempt ${attempt + 1}, key ${(currentKeyIndex % GEMINI_API_KEYS.length) + 1})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 40000, responseMimeType: "application/json" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.log(`  API error (${response.status}): ${errText.substring(0, 200)}`);
        await delay(3000);
        continue;
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        console.log('  Empty response, trying next key...');
        await delay(2000);
        continue;
      }

      const content = JSON.parse(text);

      if (!content.intro || !content.items || !content.faq) {
        console.log('  Invalid structure, retrying...');
        await delay(2000);
        continue;
      }

      return content;
    } catch (error) {
      console.log(`  Error: ${error.message}, trying next key...`);
      await delay(2000);
    }
  }
  throw new Error(`Failed to generate content for: ${keyword}`);
}

// ========== CREATE ASTRO FILE ==========
async function createAstroFile(article, content, imagePath) {
  // Capitalize first letter of each word for proper title
  const simpleTitle = article.keyword
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  const slug = slugify(article.keyword);
  const publishDate = new Date().toISOString();
  const author = getNextAuthor();

  // Extract excerpt from intro HTML - first <p> content, stripped of tags
  const introHtml = content.intro || '';
  const firstPMatch = introHtml.match(/<p>([\s\S]*?)<\/p>/);
  const rawExcerpt = firstPMatch ? firstPMatch[1] : introHtml.substring(0, 160);
  const cleanExcerpt = rawExcerpt.replace(/<[^>]*>/g, '');
  const excerpt = escapeForTemplate(cleanExcerpt);

  // Build TOC from items + comparison + guide + FAQ
  const tocEntries = [];
  content.items.forEach((item, i) => {
    tocEntries.push({ id: `produs-${i + 1}`, title: stripStrong(item.name) });
  });
  if (content.comparison) {
    tocEntries.push({ id: 'comparatie', title: stripStrong(content.comparison.heading) });
  }
  if (content.guide) {
    tocEntries.push({ id: 'ghid', title: stripStrong(content.guide.heading) });
  }
  tocEntries.push({ id: 'faq', title: 'Intrebari frecvente' });

  const tocLinks = tocEntries.map(item =>
    `<a href="#${item.id}" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">${item.title}</a>`
  ).join('\n                ');

  // Build items HTML
  let itemsHtml = '';
  content.items.forEach((item, i) => {
    let reviewContent = (item.review || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Ensure review content is wrapped in <p> tags
    if (!reviewContent.includes('<p>')) {
      reviewContent = reviewContent.split(/\n\n+/).map(p => p.trim()).filter(p => p)
        .map(p => p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div)/i) ? p : `<p>${p}</p>`).join('\n          ');
    }

    const specsGrid = Object.entries(item.specs || {}).map(([key, val]) =>
      `<div class="product-review__spec"><strong>${key}</strong>${val}</div>`
    ).join('\n              ');

    const prosHtml = (item.pros || []).map(p => `<li>${p}</li>`).join('\n                  ');
    const consHtml = (item.cons || []).map(c => `<li>${c}</li>`).join('\n                  ');

    itemsHtml += `
          <article id="produs-${i + 1}" class="product-review">
            <div class="product-review__header">
              <span class="section-tag">Produs #${i + 1}</span>
              <h3>${stripStrong(item.name)}</h3>
              <div class="product-review__specs-grid">
              ${specsGrid}
              </div>
            </div>
            <div class="product-review__content">
              ${reviewContent}
              <div class="product-review__lists">
                <div>
                  <h4>Avantaje</h4>
                  <ul class="product-review__pros">
                  ${prosHtml}
                  </ul>
                </div>
                <div>
                  <h4>Dezavantaje</h4>
                  <ul class="product-review__cons">
                  ${consHtml}
                  </ul>
                </div>
              </div>
            </div>
          </article>`;
  });

  // Build comparison table HTML
  let comparisonHtml = '';
  if (content.comparison && content.comparison.rows && content.comparison.rows.length > 0) {
    // Dynamic column headers from row keys
    const colKeys = Object.keys(content.comparison.rows[0]);
    const thCells = colKeys.map(k => `<th>${k.charAt(0).toUpperCase() + k.slice(1)}</th>`).join('');
    const rowsHtml = content.comparison.rows.map(row =>
      `<tr>${colKeys.map(k => `<td>${row[k] || ''}</td>`).join('')}</tr>`
    ).join('\n              ');

    comparisonHtml = `
          <section id="comparatie" class="mb-10">
            <h2 class="text-2xl font-bold text-slate-900 mb-4">${stripStrong(content.comparison.heading)}</h2>
            <div class="comparison-outer" id="comparison-outer">
              <div class="comparison-hint"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Gliseaza pentru mai multe coloane</div>
              <div class="comparison-wrap">
                <table class="comparison-table">
                  <thead><tr>${thCells}</tr></thead>
                  <tbody>
              ${rowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </section>`;
  }

  // Build guide HTML
  let guideHtml = '';
  if (content.guide) {
    let guideContent = (content.guide.content || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    if (!guideContent.includes('<p>')) {
      guideContent = guideContent.split(/\n\n+/).map(p => p.trim()).filter(p => p)
        .map(p => p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div)/i) ? p : `<p>${p}</p>`).join('\n            ');
    }
    guideHtml = `
          <section id="ghid" class="mb-10">
            <h2 class="text-2xl font-bold text-slate-900 mb-4">${stripStrong(content.guide.heading)}</h2>
            <div class="guide">
              ${guideContent}
            </div>
          </section>`;
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": content.faq.map(item => ({
      "@type": "Question",
      "name": stripStrong(item.question),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": stripStrong(item.answer)
      }
    }))
  };

  let astroContent = `---
export const frontmatter = {
  title: "${simpleTitle.replace(/"/g, '\\"')}",
  slug: "${slug}",
  category: "${article.category}",
  categorySlug: "${article.categorySlug}",
  excerpt: "${excerpt.replace(/"/g, '\\"')}",
  image: "${imagePath || '/images/placeholder.webp'}",
  publishDate: "${publishDate}",
  modifiedDate: "${publishDate}",
  author: "${author}"
};

import Layout from '../layouts/Layout.astro';
import PrevNextNav from '../components/PrevNextNav.astro';
import keywordsData from '../../keywords.json';

const allArticles = (keywordsData.completed || []).map(item => ({
  title: item.keyword.charAt(0).toUpperCase() + item.keyword.slice(1),
  slug: item.keyword.toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  category: item.category,
  categorySlug: item.categorySlug,
  date: item.date || new Date().toISOString()
}));
---

<Layout
  title={frontmatter.title}
  description={frontmatter.excerpt}
  canonical={\`/\${frontmatter.slug}/\`}
  type="article"
  image={frontmatter.image}
  author={frontmatter.author}
  category={frontmatter.category}
  categorySlug={frontmatter.categorySlug}
  publishDate={frontmatter.publishDate}
  modifiedDate={frontmatter.modifiedDate}
  faqSchema={${JSON.stringify(faqSchema, null, 2).split('\n').join('\n  ')}}
>
  <article class="bg-white">
    <header class="bg-gradient-to-br from-slate-900 to-slate-800 py-12 md:py-16">
      <div class="container-main">
        <nav class="text-sm text-slate-400 mb-4">
          <a href="/" class="hover:text-white transition-colors">Acasa</a>
          <span class="mx-2">/</span>
          <a href={\`/\${frontmatter.categorySlug}/\`} class="hover:text-white transition-colors">{frontmatter.category}</a>
          <span class="mx-2">/</span>
          <span class="text-slate-200">{frontmatter.title}</span>
        </nav>
        <h1 class="text-3xl md:text-4xl font-bold text-white mb-4">{frontmatter.title}</h1>
        <p class="text-slate-300 text-lg max-w-3xl">{frontmatter.excerpt}</p>
        <div class="flex items-center gap-4 mt-6 text-sm text-slate-400">
          <span>{frontmatter.author}</span>
          <span>•</span>
          <time datetime={frontmatter.publishDate}>{new Date(frontmatter.publishDate).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
        </div>
      </div>
    </header>

    <div class="container-main py-10 md:py-14">
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <aside class="lg:col-span-1">
          <div class="sticky top-24">
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
                ${tocLinks}
                </nav>
              </details>
            </div>
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
                ${tocLinks}
                </nav>
              </details>
            </div>
          </div>
        </aside>

        <div class="lg:col-span-3 prose-article">
          ${imagePath ? `<img src="${imagePath}" alt="${simpleTitle}" class="w-full rounded-xl mb-8 shadow-lg" loading="eager" />` : ''}

          <section id="intro" class="mb-10">
            ${introHtml}
          </section>

          ${itemsHtml}

          ${comparisonHtml}

          ${guideHtml}

          <section id="faq" class="mt-12 pt-8 border-t border-slate-200">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Intrebari frecvente</h2>
            <div class="space-y-4">
              ${content.faq.map(item => `
              <details class="group bg-slate-50 rounded-lg">
                <summary class="flex items-center justify-between cursor-pointer p-4 font-medium text-slate-900">
                  ${stripStrong(item.question)}
                  <svg class="w-5 h-5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </summary>
                <div class="px-4 pb-4 text-slate-600">
                  ${stripStrong(item.answer)}
                </div>
              </details>`).join('\n              ')}
            </div>
          </section>

          <!-- Prev/Next Navigation -->
          <PrevNextNav
            currentSlug="${slug}"
            currentCategory="${article.categorySlug}"
            articles={allArticles}
          />
        </div>
      </div>
    </div>
  </article>

  <script>
    // Comparison table scroll fade
    (function() {
      const outer = document.getElementById('comparison-outer');
      if (!outer) return;
      const wrap = outer.querySelector('.comparison-wrap');
      function checkScroll() {
        if (wrap.scrollWidth > wrap.clientWidth) {
          outer.classList.add('can-scroll');
        } else {
          outer.classList.remove('can-scroll');
        }
        if (wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2) {
          outer.classList.remove('can-scroll');
        }
      }
      checkScroll();
      wrap.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    })();

    // TOC active section tracking
    (function() {
      const tocLinks = document.querySelectorAll('#desktop-toc a, #mobile-toc a');
      const sections = [];
      tocLinks.forEach(link => {
        const id = link.getAttribute('href')?.replace('#', '');
        const el = id && document.getElementById(id);
        if (el) sections.push({ el, link });
      });
      if (!sections.length) return;
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const match = sections.find(s => s.el === entry.target);
          if (match) {
            if (entry.isIntersecting) {
              tocLinks.forEach(l => l.classList.remove('font-bold', 'text-primary-600'));
              match.link.classList.add('font-bold', 'text-primary-600');
              // Also highlight in the other TOC (mobile/desktop)
              tocLinks.forEach(l => {
                if (l !== match.link && l.getAttribute('href') === match.link.getAttribute('href')) {
                  l.classList.add('font-bold', 'text-primary-600');
                }
              });
            }
          }
        });
      }, { rootMargin: '-80px 0px -60% 0px' });
      sections.forEach(s => observer.observe(s.el));
    })();
  </script>
</Layout>
`;

  const filePath = path.join(projectDir, 'src', 'pages', `${slug}.astro`);
  astroContent = stripFakeLinks(astroContent, path.join(projectDir, 'src', 'pages'));
  await fs.writeFile(filePath, astroContent, 'utf-8');
  console.log(`  Article saved: ${slug}.astro`);

  return { slug, excerpt };
}

// ========== MAIN ==========
async function main() {
  console.log('='.repeat(60));
  console.log('BATCH ARTICLE GENERATION');
  console.log('='.repeat(60));

  // Load keywords data for interlinking
  const keywordsPath = path.join(projectDir, 'keywords.json');
  let keywordsData = { completed: [] };
  try {
    const kwContent = await fs.readFile(keywordsPath, 'utf-8');
    keywordsData = JSON.parse(kwContent);
  } catch (e) {
    console.log('No keywords.json found, starting without interlinks');
  }

  // Read articles to generate
  const configPath = path.join(__dirname, 'temp-articles.json');
  let articles;
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    articles = JSON.parse(configContent);
  } catch (error) {
    console.error('Could not read temp-articles.json:', error.message);
    process.exit(1);
  }

  console.log(`Articles to generate: ${articles.length}`);

  const successfulKeywords = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i + 1}/${articles.length}] ${article.keyword}`);
    console.log('-'.repeat(50));

    let retries = 3;
    let success = false;
    while (retries > 0) {
      try {
        console.log('  Generating content...');
        const generatedContent = await generateArticleContent(article.keyword, article.category, keywordsData?.completed || []);

        await delay(1000);

        const imagePath = await generateImage(article.imagePrompt, slugify(article.keyword), article.categorySlug);

        await delay(1000);

        const articleData = await createAstroFile(article, generatedContent, imagePath);

        console.log('  SUCCESS!');
        success = true;
        successfulKeywords.push(article.keyword);
        break;

      } catch (error) {
        retries--;
        if (retries > 0) {
          const isRateLimit = error.message.includes('429');
          const waitTime = isRateLimit ? 60000 : 5000;
          console.log(`  Retry ${3 - retries}/3 - waiting ${waitTime/1000}s...`);
          await delay(waitTime);
        } else {
          console.error(`  FAILED: ${error.message}`);
        }
      }
    }

    if (i < articles.length - 1) {
      console.log('  Waiting before next article...');
      await delay(3000);
    }
  }

  // Write successful keywords to file for auto-generate.js to read
  const successPath = path.join(__dirname, 'successful-keywords.json');
  await fs.writeFile(successPath, JSON.stringify(successfulKeywords, null, 2));
  console.log(`\nSuccessfully generated: ${successfulKeywords.length}/${articles.length} articles`);

  console.log('\n' + '='.repeat(60));
  console.log('BATCH GENERATION COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
