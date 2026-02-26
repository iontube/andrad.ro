import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';

// ========== CONFIG ==========
const GEMINI_API_KEYS = [
  'AIzaSyAbRzbs0WRJMb0gcojgyJlrjqOPr3o2Cmk',
  'AIzaSyDZ2TklBMM8TU3FA6aIS8vdUc-2iMyHWaM',
  'AIzaSyBdmChQ0ARDdDAqSMSlDIit_xz5ucrWjkY',
  'AIzaSyAE57AIwobFO4byKbeoa-tVDMV5lMgcAxQ',
  'AIzaSyBskPrKeQvxit_Rmm8PG_NO0ZhMQsrktTE'
];

const IMAGEROUTER_API_KEY = '941d0f4b13aaa3b3e115136ded0515336bd3fe804db1c010cbf69d333bde4b8c';
const IMAGE_MODEL = 'openai/gpt-image-1.5:free';

let currentKeyIndex = 0;

// ========== MISSING ARTICLES ==========
const articles = [
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun soundbar Dolby Atmos',
    imagePrompt: 'Ultra-realistic photo of a premium Dolby Atmos soundbar, sleek elongated design, black or silver finish, with wireless subwoofer, placed under modern TV in contemporary living room, soft ambient lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun aparat foto mirrorless full frame',
    imagePrompt: 'Ultra-realistic photo of a premium full-frame mirrorless camera, professional black body, attached lens, ergonomic grip, placed on clean white surface, soft studio lighting, clean reflections, high detail texture, sharp focus, professional product photography, luxury photography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun gimbal profesional pentru cameră',
    imagePrompt: 'Ultra-realistic photo of a professional camera gimbal stabilizer, three-axis design, compact folding mechanism, with camera mounted, soft studio lighting, high detail texture, sharp focus, professional product photography, premium videography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Smart Home',
    categorySlug: 'smart-home',
    keyword: 'cele mai bune camere de supraveghere wireless premium',
    imagePrompt: 'Ultra-realistic photo of premium wireless security cameras, sleek white modern design, indoor and outdoor models, placed on clean surface, soft studio lighting, clean reflections, high detail texture, sharp focus, professional product photography, smart home security devices, no people, neutral background, realistic proportions'
  },
  {
    category: 'Smart Home',
    categorySlug: 'smart-home',
    keyword: 'cel mai bun termostat inteligent premium',
    imagePrompt: 'Ultra-realistic photo of a premium smart thermostat, sleek round or square design, digital display showing temperature, mounted on modern white wall, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, smart home device, no people, neutral background, realistic proportions'
  }
];

// ========== UTILITY FUNCTIONS ==========
function getNextApiKey() {
  const key = GEMINI_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
  return key;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== GENERATE IMAGE ==========
async function generateImage(imagePrompt, slug) {
  console.log(`  Image prompt: ${imagePrompt.substring(0, 100)}...`);

  try {
    const response = await fetch('https://api.imagerouter.io/v1/openai/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${IMAGEROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await response.json();

    if (data.data && data.data[0] && data.data[0].url) {
      const imageUrl = data.data[0].url;
      console.log(`  Image generated (cost: $${data.cost || 0})`);
      const imagePath = await downloadAndCompressImage(imageUrl, slug);
      return imagePath;
    } else {
      console.error('  Image generation failed:', data);
      return null;
    }
  } catch (error) {
    console.error('  Image error:', error.message);
    return null;
  }
}

// ========== DOWNLOAD AND COMPRESS IMAGE ==========
async function downloadAndCompressImage(imageUrl, slug) {
  const imagesDir = path.join(process.cwd(), 'public', 'images', 'articles');
  await fs.mkdir(imagesDir, { recursive: true });

  const imagePath = path.join(imagesDir, `${slug}.webp`);
  const publicPath = `/images/articles/${slug}.webp`;

  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;

    protocol.get(imageUrl, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          await sharp(buffer)
            .resize(800, 600, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(imagePath);
          console.log(`  Image saved: ${publicPath}`);
          resolve(publicPath);
        } catch (err) {
          reject(err);
        }
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ========== GENERATE ARTICLE CONTENT ==========
async function generateArticleContent(keyword, category) {
  const apiKey = getNextApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `Esti un expert SEO si copywriter pentru un site de review-uri de produse din Romania.

Scrie un articol complet pentru keyword-ul: "${keyword}"
Categoria: ${category}

REGULI STRICTE:
1. NU folosi NICIODATA aceste cuvinte/expresii: "ghid", "concluzie", "în concluzie", "drept urmare", "așadar", "cu toate acestea", "în primul rând", "în al doilea rând", "de asemenea", "mai mult decât atât", "în ceea ce privește", "totodată", "prin urmare"
2. Scrie natural, ca un expert care vorbește cu un prieten
3. Folosește un ton conversational dar profesionist
4. Include date tehnice concrete, specificații reale
5. Menționează branduri și modele reale (fără prețuri exacte)

STRUCTURA ARTICOLULUI:
1. TITLU: Captivant, include keyword-ul natural
2. EXCERPT: 1-2 propoziții care rezumă articolul (pentru meta description)
3. CUPRINS: Lista cu toate secțiunile H2 din articol
4. INTRODUCERE: 2-3 paragrafe care prezintă subiectul (fără heading)
5. 5-7 SECȚIUNI H2: Fiecare cu 2-4 paragrafe și eventual subsecțiuni H3
6. FAQ: 5 întrebări frecvente cu răspunsuri (pentru schema FAQ)

FORMAT RASPUNS (JSON strict):
{
  "title": "Titlul articolului",
  "excerpt": "Meta description scurt",
  "sections": [
    {
      "heading": "Titlu sectiune H2",
      "content": "Continut paragraf...",
      "subsections": [
        {
          "heading": "Titlu H3 optional",
          "content": "Continut..."
        }
      ]
    }
  ],
  "faq": [
    {
      "question": "Intrebare?",
      "answer": "Raspuns detaliat."
    }
  ]
}

IMPORTANT: Raspunde DOAR cu JSON valid, fara markdown code blocks sau alte caractere.`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8000
        }
      })
    });

    const rawText = await response.text();
    console.log('  API Response status:', response.status);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${rawText.substring(0, 200)}`);
    }

    const data = JSON.parse(rawText);
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Content generation error:', error.message);
    throw error;
  }
}

// ========== CREATE ASTRO FILE ==========
async function createAstroFile(article, content, imagePath) {
  const slug = slugify(content.title);
  const publishDate = new Date().toISOString().split('T')[0];

  const toc = content.sections.map((s, i) => ({
    id: `sectiune-${i + 1}`,
    title: s.heading
  }));

  let sectionsHtml = '';
  content.sections.forEach((section, i) => {
    sectionsHtml += `
  <section id="sectiune-${i + 1}" class="mb-10">
    <h2 class="text-2xl font-bold text-slate-900 mb-4">${section.heading}</h2>
    ${section.content.split('\n').filter(p => p.trim()).map(p => `<p class="mb-4">${p}</p>`).join('\n    ')}
    ${section.subsections ? section.subsections.map(sub => `
    <h3 class="text-xl font-semibold text-slate-800 mt-6 mb-3">${sub.heading}</h3>
    ${sub.content.split('\n').filter(p => p.trim()).map(p => `<p class="mb-4">${p}</p>`).join('\n    ')}`).join('') : ''}
  </section>`;
  });

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": content.faq.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  };

  const astroContent = `---
export const frontmatter = {
  title: "${content.title.replace(/"/g, '\\"')}",
  slug: "${slug}",
  category: "${article.category}",
  categorySlug: "${article.categorySlug}",
  excerpt: "${content.excerpt.replace(/"/g, '\\"')}",
  image: "${imagePath || '/images/placeholder.webp'}",
  publishDate: "${publishDate}",
  author: "Echipa Andrad.ro"
};

import Layout from '../layouts/Layout.astro';
---

<Layout
  title={frontmatter.title}
  description={frontmatter.excerpt}
  canonical={\`/\${frontmatter.slug}/\`}
  type="article"
  image={frontmatter.image}
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
          <div class="sticky top-24 bg-slate-50 rounded-xl p-6">
            <h2 class="font-bold text-slate-900 mb-4 text-lg">Cuprins</h2>
            <nav class="space-y-2">
              ${toc.map(item => `<a href="#${item.id}" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">${item.title}</a>`).join('\n              ')}
              <a href="#faq" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">Intrebari frecvente</a>
            </nav>
          </div>
        </aside>

        <div class="lg:col-span-3 prose-custom">
          ${imagePath ? `<img src="${imagePath}" alt="${content.title}" class="w-full rounded-xl mb-8 shadow-lg" loading="eager" />` : ''}

          ${sectionsHtml}

          <section id="faq" class="mt-12 pt-8 border-t border-slate-200">
            <h2 class="text-2xl font-bold text-slate-900 mb-6">Intrebari frecvente</h2>
            <div class="space-y-4">
              ${content.faq.map(item => `
              <details class="group bg-slate-50 rounded-lg">
                <summary class="flex items-center justify-between cursor-pointer p-4 font-medium text-slate-900">
                  ${item.question}
                  <svg class="w-5 h-5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </summary>
                <div class="px-4 pb-4 text-slate-600">
                  ${item.answer}
                </div>
              </details>`).join('\n              ')}
            </div>
          </section>
        </div>
      </div>
    </div>
  </article>
</Layout>
`;

  const filePath = path.join(process.cwd(), 'src', 'pages', `${slug}.astro`);
  await fs.writeFile(filePath, astroContent, 'utf-8');
  console.log(`  Article saved: ${filePath}`);
  return slug;
}

// ========== MAIN FUNCTION ==========
async function main() {
  console.log('='.repeat(60));
  console.log('GENERATING MISSING ARTICLES');
  console.log('='.repeat(60));
  console.log(`Articles to generate: ${articles.length}`);

  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i + 1}/${articles.length}] Processing: ${article.keyword}`);
    console.log('-'.repeat(50));

    let retries = 3;
    while (retries > 0) {
      try {
        console.log('  Generating content with Gemini...');
        const content = await generateArticleContent(article.keyword, article.category);
        console.log(`  Title: ${content.title}`);

        await delay(1000);
        const imagePath = await generateImage(article.imagePrompt, slugify(content.title));
        await delay(1000);

        const slug = await createAstroFile(article, content, imagePath);

        results.push({
          keyword: article.keyword,
          title: content.title,
          slug,
          status: 'success'
        });

        console.log(`  SUCCESS!`);

        if (i < articles.length - 1) {
          console.log('  Waiting 10 seconds before next article...');
          await delay(10000);
        }
        break;

      } catch (error) {
        retries--;
        if (retries > 0) {
          const isRateLimit = error.message.includes('429') || error.message.includes('quota');
          const waitTime = isRateLimit ? 60000 : 5000;
          console.log(`  Retry ${3 - retries}/3 - Error: ${error.message.substring(0, 80)}`);
          console.log(`  Waiting ${waitTime/1000}s before retry...`);
          await delay(waitTime);
        } else {
          console.error(`  FAILED after 3 attempts: ${error.message.substring(0, 100)}`);
          results.push({
            keyword: article.keyword,
            status: 'failed',
            error: error.message
          });
        }
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('GENERATION COMPLETE');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`Successful: ${successful}/${articles.length}`);
  console.log(`Failed: ${failed}/${articles.length}`);

  if (failed > 0) {
    console.log('\nFailed articles:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.keyword}`);
    });
  }
}

main().catch(console.error);
