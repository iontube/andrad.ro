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
import { readFileSync } from 'fs';
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
const GEMINI_API_KEYS = [
  'AIzaSyAbRzbs0WRJMb0gcojgyJlrjqOPr3o2Cmk',
  'AIzaSyDZ2TklBMM8TU3FA6aIS8vdUc-2iMyHWaM',
  'AIzaSyBdmChQ0ARDdDAqSMSlDIit_xz5ucrWjkY',
  'AIzaSyAE57AIwobFO4byKbeoa-tVDMV5lMgcAxQ',
  'AIzaSyBskPrKeQvxit_Rmm8PG_NO0ZhMQsrktTE',
  'AIzaSyAkUcQ3YiD9cFiwNh8pkmKVxVFxEKFJl2Q',
  'AIzaSyDnX940N-U-Sa0202-v3_TOjXf42XzoNxE',
  'AIzaSyAMl3ueRPwzT1CklxkylmTXzXkFd0A_MqI',
  'AIzaSyA82h-eIBvHWvaYLoP26zMWI_YqwT78OaI',
  'AIzaSyBRI7pd1H2EdCoBunJkteKaCDSH3vfqKUg',
  'AIzaSyA3IuLmRWyTtygsRJYyzHHvSiTPii-4Dbk',
  'AIzaSyB6RHadv3m1WWTFKb_rB9ev_r4r2fM9fNU',
  'AIzaSyCexyfNhzT2py3FLo3sXftqKh0KUdAT--A',
  'AIzaSyC_SN_RdQ2iXzgpqng5Byr-GU5KC5npiAE',
  'AIzaSyBOV9a_TmVAayjpWemkQNGtcEf_QuiXMG0',
  'AIzaSyCFOafntdykM82jJ8ILUqY2l97gdOmwiGg',
  'AIzaSyACxFhgs3tzeeI5cFzrlKmO2jW0l8poPN4',
  'AIzaSyBhZXBhPJCv9x8jKQljZCS4b5bwF3Ip3pk',
  'AIzaSyDF7_-_lXcAKF81SYpcD-NiA5At4Bi8tp8',
  'AIzaSyAwinD7oQiQnXeB2I5kyQsq_hEyJGhSrNg',
];

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== TRANSLATE TO ENGLISH ==========
async function translateToEnglish(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
async function generateImage(imagePrompt, slug, categorySlug) {
  const categoryPrompts = {
    'foto-video': 'on a clean desk setup with soft studio lighting, modern workspace, minimalist background',
    'smart-home': 'in a modern smart home interior, ambient LED lighting, contemporary minimalist living room',
    'tehnologie-gaming': 'on a modern desk setup with RGB lighting, gaming atmosphere, dark background with subtle tech glow',
    'electrocasnice': 'in a modern kitchen or home interior, clean contemporary setting, soft natural lighting',
    'tv-audio': 'in a stylish modern living room, cinematic atmosphere, clean contemporary interior design',
  };

  console.log(`  Generating image for: ${imagePrompt}`);

  try {
    const titleEn = await translateToEnglish(imagePrompt);
    console.log(`  Translated title: ${titleEn}`);

    const setting = categoryPrompts[categorySlug] || 'in a modern home setting, soft natural lighting, clean contemporary background';
    const prompt = `Realistic photograph of ${titleEn} ${setting}, no text, no brand name, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional product photography.`;

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
      return null;
    }

    const data = await response.json();
    if (!data.result?.image) {
      console.error('  No image in response');
      return null;
    }

    const imageBuffer = Buffer.from(data.result.image, 'base64');
    const imagePath = await downloadAndCompressImage(imageBuffer, slug);
    return imagePath;
  } catch (error) {
    console.error(`  Image generation error: ${error.message}`);
    return null;
  }
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
async function generateArticleContent(keyword, category) {
  const prompt = `Esti un expert in tehnologie si gadgeturi care scrie pe un blog romanesc de review-uri tech. Scrii intr-un stil direct, conversational, ca un prieten care se pricepe si iti da sfaturi concrete. NU esti un AI. Esti un om real cu experienta reala.

Keyword: "${keyword}"
Categorie: "${category}"

GENEREAZA un articol complet in format JSON cu structura de mai jos. Articolul trebuie sa fie informativ, natural, scris de un om care chiar stie domeniul. Fara diacritice. Intre 1500-2500 de cuvinte.

=== 1. SEARCH INTENT MAPPING (CRITIC) ===
Structura articolului urmeaza EXACT ce cauta userul cand tasteaza "${keyword}" in Google:
- PRIMA sectiune = raspunsul direct, concret, fara introducere, fara "bun venit", fara preambul. Userul vrea raspunsul ACUM.
- Dupa raspunsul direct, vin detaliile, comparatiile, criteriile de alegere.
- Fiecare sectiune raspunde la o sub-intrebare pe care userul o are in minte.
- NU incepe NICIODATA cu o introducere generica. Prima propozitie = recomandarea ta directa sau raspunsul la intentia de cautare.
- Excerptul = primele 2-3 propozitii din articol care dau raspunsul direct. Asta apare in Google ca snippet.

=== 2. ANTI-AI FOOTPRINT (FOARTE IMPORTANT) ===
Articolul TREBUIE sa para scris de un om real, nu de AI. Reguli concrete:
- FARA tranzitii generice: NU folosi "Asadar", "In primul rand", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Trebuie sa tinem cont", "Nu in ultimul rand"
- FARA structura predictibila: nu toate paragrafele sa aiba aceeasi lungime. Amesteca: un paragraf de 2 propozitii, urmat de unul de 4, apoi unul de 1 propozitie.
- IMPERFECTIUNI NATURALE: include formulari imperfecte dar naturale: "bon, stai", "cum sa zic", "pana la urma", "na, asta e", "ma rog", "zic si eu"
- Amesteca propozitii FOARTE scurte (3-5 cuvinte: "Merita. Punct." / "Nu-i rau." / "Depinde de buget.") cu propozitii lungi (18-22 cuvinte)
- Foloseste MULT limbaj conversational romanesc: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "am sa fiu direct", "uite care-i treaba"
- INTERZIS TOTAL: "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta"
- INTERZIS: liste de 3 adjective consecutive, inceperea a doua propozitii la rand cu acelasi cuvant, folosirea aceluiasi pattern de inceput de paragraf
- Include anecdote personale CONCRETE: "am avut un X care a tinut 4 ani", "un prieten si-a luat un Y si dupa 2 luni...", "am testat personal modelul asta vreo 3 saptamani"
- Include critici ONESTE: fiecare produs sa aiba minim 1-2 minusuri reale, nu critici false gen "singurul minus e ca e prea bun"
- Recunoaste incertitudine: "n-am testat personal, dar din ce am auzit...", "pe asta nu pun mana in foc, dar..."
- Vorbeste ca pe un forum romanesc, nu ca o enciclopedie

=== 3. FAQ OPTIMIZAT PEOPLE ALSO ASK ===
8 intrebari formatate EXACT cum le tasteaza oamenii in Google Romania:
- Foloseste formulari naturale de cautare: "cat costa...", "care e diferenta intre...", "merita sa...", "ce ... e mai bun", "de ce...", "cum sa...", "unde gasesc..."
- FARA intrebari artificiale sau formale. Gandeste-te: ce ar tasta un roman in Google?
- Raspunsurile au structura de FEATURED SNIPPET: prima propozitie = raspunsul direct si clar, apoi 1-2 propozitii cu detalii si cifre concrete
- Raspuns = 40-70 cuvinte, auto-suficient (sa poata fi afisat singur ca snippet fara context)
- Include cifre concrete: preturi in lei, procente, durate, dimensiuni
- Acoperiti: pret, comparatie, durabilitate, alegere, probleme frecvente, intretinere, autenticitate, unde sa cumperi

=== 4. LIZIBILITATE PERFECTA PARAGRAFE ===
- MAXIM 3-4 propozitii per paragraf. Niciodata mai mult.
- Paragrafele lungi sunt INTERZISE. Daca un paragraf are mai mult de 4 propozitii, sparge-l.
- Alterna paragrafele: unul mai lung (3-4 prop), unul scurt (1-2 prop), unul mediu (2-3 prop)
- Intre sectiuni lasa "aer" - nu pune paragraf dupa paragraf fara pauza
- Foloseste bullet points (<ul><li>) pentru liste de criterii, avantaje, dezavantaje - nu le pune in text continuu
- Subtitlurile (H3) sparg monotonia - foloseste-le in cadrul sectiunilor pentru a crea sub-puncte

=== 5. CUVINTE CHEIE IN STRONG ===
- Pune keyword-ul principal si variatiile lui in <strong> tags de fiecare data cand apar natural in text
- Keyword principal: "${keyword}" - trebuie sa apara de 4-6 ori in tot articolul, in <strong>
- Variatii naturale ale keyword-ului: pune si ele in <strong>
- NU pune in strong cuvinte random sau irelevante. Doar keyword-urile si variatiile lor.
- Nu forta keyword density. Trebuie sa sune natural, ca si cum ai sublinia ce e important.
- NICIODATA nu pune <strong> in titluri de sectiuni (heading), in intrebarile FAQ, sau in textul din cuprins/TOC. Strong se foloseste DOAR in paragrafe de text (<p>), nu in <h2>, <h3>, "question", sau "heading".

=== REGULI SUPLIMENTARE ===
- Scrie FARA diacritice (fara ă, î, ș, ț, â - foloseste a, i, s, t)
- Preturile sa fie in LEI si realiste pentru piata din Romania
- Fiecare sectiune minim 250 cuvinte

STRUCTURA JSON (returneaza DOAR JSON valid, fara markdown, fara \`\`\`):
{
  "excerpt": "Primele 2-3 propozitii care dau raspunsul direct la ce cauta userul. Recomandarea concreta + context scurt. FARA introducere.",
  "sections": [
    {
      "heading": "Titlu sectiune cu keyword integrat natural",
      "content": "HTML formatat cu <p>, <strong>, <ul>/<li>. Minim 250 cuvinte per sectiune. Paragrafele separate cu </p><p>. Maxim 3-4 propozitii per paragraf."
    }
  ],
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct (featured snippet). Apoi 1-2 propozitii cu detalii si cifre. Total 40-70 cuvinte."
    }
  ]
}

SECTIUNI OBLIGATORII (6 sectiuni, titluri creative, NU generice):
1. [Raspuns direct] - recomandarea ta principala cu explicatie, fara preambul (titlu creativ legat de keyword, NU "raspunsul direct")
2. [Top recomandari] - 4-5 produse cu preturi reale in lei, avantaje si dezavantaje oneste (cu minusuri reale)
3. [Criterii de alegere] - pe ce sa te uiti cand alegi, explicat pe intelesul tuturor, cu exemple concrete
4. [Comparatie] - head-to-head intre 2-3 optiuni populare, cu preturi si diferente clare
5. [Greseli si tips] - ce sa eviti, sfaturi de insider, greseli pe care le fac toti
6. [Verdict pe buget] - recomandare finala pe 3 categorii de buget: mic, mediu, mare (NU folosi cuvantul "concluzie")

FAQ: 8 intrebari naturale, formulari de cautare Google reale, raspunsuri cu structura featured snippet.`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const apiKey = getNextApiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      console.log(`  Generating content (attempt ${attempt + 1}, key ${(currentKeyIndex % GEMINI_API_KEYS.length) + 1})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 20000 }
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

      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      // Extract JSON object if there's extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      const content = JSON.parse(text);

      if (!content.excerpt || !content.sections || !content.faq) {
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

  const rawExcerpt = content.excerpt || content.sections[0]?.content?.split('\n')[0]?.substring(0, 160) + '...';
  const cleanExcerpt = rawExcerpt.replace(/<[^>]*>/g, '');  // Strip HTML tags
  const excerpt = escapeForTemplate(cleanExcerpt);

  // Filter out sections without headings (like introduction) from TOC
  const toc = content.sections
    .map((s, i) => ({
      id: `sectiune-${i + 1}`,
      title: stripStrong(s.heading)
    }))
    .filter(item => item.title && item.title !== 'null');

  const tocLinks = toc.map(item =>
    `<a href="#${item.id}" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">${item.title}</a>`
  ).join('\n                ') + '\n                <a href="#faq" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">Intrebari frecvente</a>';

  let sectionsHtml = '';
  content.sections.forEach((section, i) => {
    let sectionContent = section.content;
    sectionContent = sectionContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Normalize: if content already has <p> tags, strip them first
    if (sectionContent.includes('<p>') || sectionContent.includes('<p ')) {
      sectionContent = sectionContent
        .replace(/<\/p>\s*<p>/g, '\n')
        .replace(/<p[^>]*>/g, '')
        .replace(/<\/p>/g, '\n');
    }

    // Insert breaks around block-level elements so they get properly separated
    sectionContent = sectionContent
      .replace(/(<(?:h[1-6]|ul|ol|blockquote|table|div)[\s>])/gi, '\n\n$1')
      .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|div)>)/gi, '$1\n\n');

    // Split into blocks and wrap text in <p>, leave block elements as-is
    let blocks = sectionContent.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    // Fallback: if \n\n split produced a single large block, try splitting on \n
    if (blocks.length <= 1 && sectionContent.includes('\n')) {
      blocks = sectionContent.split(/\n/).map(p => p.trim()).filter(p => p);
    }
    sectionContent = blocks.map(p => {
      if (p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div|section)/i)) {
        return p;
      }
      return `<p>${p}</p>`;
    }).join('\n        ');

    // Split overly long paragraphs for better readability
    sectionContent = sectionContent.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
      if (inner.length < 500) return match;
      // Split on sentence boundaries (. followed by space and uppercase letter)
      const sentences = inner.split(/(?<=\.)\s+(?=[A-Z])/);
      if (sentences.length <= 3) return match;
      // Group sentences into paragraphs of 2-4 sentences
      const paragraphs = [];
      let current = [];
      let currentLen = 0;
      for (const s of sentences) {
        current.push(s);
        currentLen += s.length;
        if (current.length >= 3 || currentLen > 400) {
          paragraphs.push(current.join(' '));
          current = [];
          currentLen = 0;
        }
      }
      if (current.length > 0) paragraphs.push(current.join(' '));
      if (paragraphs.length <= 1) return match;
      return paragraphs.map(p => `<p>${p}</p>`).join('\n        ');
    });

    // Skip H2 for introduction (sections without heading)
    const hasHeading = section.heading && section.heading !== 'null';
    sectionsHtml += `
  <section id="sectiune-${i + 1}" class="mb-10">
    ${hasHeading ? `<h2 class="text-2xl font-bold text-slate-900 mb-4">${stripStrong(section.heading)}</h2>` : ''}
    ${sectionContent}
    ${section.subsections ? section.subsections.map(sub => `
    <h3 class="text-xl font-semibold text-slate-800 mt-6 mb-3">${sub.heading}</h3>
    ${sub.content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').split('\n').filter(p => p.trim()).map(p => `<p class="mb-4">${p}</p>`).join('\n    ')}`).join('') : ''}
  </section>`;
  });

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

  const astroContent = `---
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

        <div class="lg:col-span-3 prose-custom">
          ${imagePath ? `<img src="${imagePath}" alt="${simpleTitle}" class="w-full rounded-xl mb-8 shadow-lg" loading="eager" />` : ''}

          ${sectionsHtml}

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

          <!-- RELATED_ARTICLES_PLACEHOLDER -->
        </div>
      </div>
    </div>
  </article>
</Layout>
`;

  const filePath = path.join(projectDir, 'src', 'pages', `${slug}.astro`);
  await fs.writeFile(filePath, astroContent, 'utf-8');
  console.log(`  Article saved: ${slug}.astro`);

  return slug;
}

// ========== MAIN ==========
async function main() {
  console.log('='.repeat(60));
  console.log('BATCH ARTICLE GENERATION');
  console.log('='.repeat(60));

  // Read articles to generate
  const configPath = path.join(__dirname, 'temp-articles.json');
  let articles;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    articles = JSON.parse(content);
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
        const content = await generateArticleContent(article.keyword, article.category);

        await delay(1000);

        const imagePath = await generateImage(article.imagePrompt, slugify(article.keyword), article.categorySlug);

        await delay(1000);

        await createAstroFile(article, content, imagePath);

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
