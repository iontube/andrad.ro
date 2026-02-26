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
let currentAuthorIndex = 0;

// ========== AUTHORS ==========
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

function getNextAuthor() {
  const author = AUTHORS[currentAuthorIndex];
  currentAuthorIndex = (currentAuthorIndex + 1) % AUTHORS.length;
  return author;
}

// ========== ARTICLES DATA WITH IMAGE PROMPTS ==========
const articles = [
  // Tehnologie & Gaming
  {
    category: 'Tehnologie & Gaming',
    categorySlug: 'tehnologie-gaming',
    keyword: 'cel mai bun PC de gaming high-end',
    imagePrompt: 'Ultra-realistic photo of a premium high-end gaming PC, tempered glass case with RGB lighting, powerful graphics card visible, liquid cooling system, modern minimalist desk setup, soft studio lighting, high detail texture, sharp focus, professional product photography, no people, clean background, realistic proportions'
  },
  {
    category: 'Tehnologie & Gaming',
    categorySlug: 'tehnologie-gaming',
    keyword: 'cel mai bun laptop de gaming RTX 4090',
    imagePrompt: 'Ultra-realistic photo of a premium gaming laptop with RTX 4090, sleek black design, RGB keyboard illumination, thin bezels display, placed on modern desk, soft natural daylight, high detail texture, sharp focus, professional product photography, luxury gaming device, no people, neutral background, realistic proportions'
  },
  {
    category: 'Tehnologie & Gaming',
    categorySlug: 'tehnologie-gaming',
    keyword: 'cel mai bun monitor OLED pentru gaming',
    imagePrompt: 'Ultra-realistic photo of a premium OLED gaming monitor, curved ultrawide display, thin bezels, vibrant colors on screen, modern desk setup, soft studio lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'Tehnologie & Gaming',
    categorySlug: 'tehnologie-gaming',
    keyword: 'cel mai bun scaun de gaming premium',
    imagePrompt: 'Ultra-realistic photo of a premium ergonomic gaming chair, high-quality leather upholstery, adjustable armrests, lumbar support, sleek modern design, placed in contemporary gaming room, soft studio lighting, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'Tehnologie & Gaming',
    categorySlug: 'tehnologie-gaming',
    keyword: 'cel mai bun sistem VR profesional',
    imagePrompt: 'Ultra-realistic photo of a professional VR headset system, sleek modern design, high-resolution display lenses visible, wireless controllers, placed on clean white surface, soft studio lighting, high detail texture, sharp focus, professional product photography, premium tech device, no people, neutral background, realistic proportions'
  },

  // Electrocasnice
  {
    category: 'Electrocasnice',
    categorySlug: 'electrocasnice',
    keyword: 'cel mai bun frigider side by side premium',
    imagePrompt: 'Ultra-realistic photo of a premium modern refrigerator, stainless steel finish, side-by-side design, sleek minimalist style, standing in a bright contemporary kitchen, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, luxury home appliance, no people, neutral background, realistic proportions'
  },
  {
    category: 'Electrocasnice',
    categorySlug: 'electrocasnice',
    keyword: 'cea mai bună mașină de spălat rufe premium',
    imagePrompt: 'Ultra-realistic photo of a premium front-load washing machine, sleek white or silver finish, modern minimalist design, digital display panel, standing in bright modern laundry room, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'Electrocasnice',
    categorySlug: 'electrocasnice',
    keyword: 'cel mai bun uscător de rufe cu pompă de căldură',
    imagePrompt: 'Ultra-realistic photo of a premium heat pump clothes dryer, sleek modern design, white or silver finish, digital touch display, standing in bright contemporary laundry room, soft natural daylight, high detail texture, sharp focus, professional product photography, luxury home appliance, no people, neutral background, realistic proportions'
  },
  {
    category: 'Electrocasnice',
    categorySlug: 'electrocasnice',
    keyword: 'cel mai bun cuptor încorporabil premium',
    imagePrompt: 'Ultra-realistic photo of a premium built-in oven, stainless steel and black glass finish, modern minimalist design, digital touch controls, installed in contemporary kitchen cabinet, soft warm lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'Electrocasnice',
    categorySlug: 'electrocasnice',
    keyword: 'cea mai bună plită cu inducție premium',
    imagePrompt: 'Ultra-realistic photo of a premium induction cooktop, sleek black glass surface, modern minimalist design, touch controls, built into contemporary kitchen counter, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, luxury kitchen appliance, no people, neutral background, realistic proportions'
  },

  // TV & Audio
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun televizor OLED 4K',
    imagePrompt: 'Ultra-realistic photo of a premium 4K OLED television, ultra-thin design, vibrant colors on display, mounted on modern living room wall, sleek minimalist stand, soft ambient lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun televizor QLED de mari dimensiuni',
    imagePrompt: 'Ultra-realistic photo of a large premium QLED television, 75 inch or larger, ultra-thin bezels, vivid colors on display, mounted in elegant modern living room, soft ambient lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun sistem home cinema 7.1',
    imagePrompt: 'Ultra-realistic photo of a premium 7.1 home cinema system, tower speakers, center channel, subwoofer, AV receiver, arranged in modern living room, large TV in background, soft ambient lighting, high detail texture, sharp focus, professional product photography, luxury audio equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun soundbar Dolby Atmos',
    imagePrompt: 'Ultra-realistic photo of a premium Dolby Atmos soundbar, sleek elongated design, black or silver finish, with wireless subwoofer, placed under modern TV in contemporary living room, soft ambient lighting, clean reflections, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },
  {
    category: 'TV & Audio',
    categorySlug: 'tv-audio',
    keyword: 'cel mai bun televizor pentru gaming console',
    imagePrompt: 'Ultra-realistic photo of a premium gaming television, large 4K display with vibrant colors, ultra-low latency screen, gaming console visible nearby, modern gaming setup, soft ambient RGB lighting, high detail texture, sharp focus, professional product photography, no people, neutral background, realistic proportions'
  },

  // Foto & Video
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun aparat foto mirrorless full frame',
    imagePrompt: 'Ultra-realistic photo of a premium full-frame mirrorless camera, professional black body, attached lens, ergonomic grip, placed on clean white surface, soft studio lighting, clean reflections, high detail texture, sharp focus, professional product photography, luxury photography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cea mai bună cameră video profesională 4K',
    imagePrompt: 'Ultra-realistic photo of a professional 4K video camera, cinema-style body, large sensor, professional lens attached, on tripod mount, soft studio lighting, high detail texture, sharp focus, professional product photography, premium videography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun obiectiv foto profesional',
    imagePrompt: 'Ultra-realistic photo of a premium professional camera lens, large aperture, sleek black barrel design, gold ring accent, placed on clean white surface, soft studio lighting, clean reflections, high detail texture, sharp focus, professional product photography, luxury photography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun gimbal profesional pentru cameră',
    imagePrompt: 'Ultra-realistic photo of a professional camera gimbal stabilizer, three-axis design, compact folding mechanism, with camera mounted, soft studio lighting, high detail texture, sharp focus, professional product photography, premium videography equipment, no people, neutral background, realistic proportions'
  },
  {
    category: 'Foto & Video',
    categorySlug: 'foto-video',
    keyword: 'cel mai bun setup pentru vlogging profesional',
    imagePrompt: 'Ultra-realistic photo of a professional vlogging setup, mirrorless camera on tripod, ring light, external microphone, modern desk arrangement, soft natural daylight, high detail texture, sharp focus, professional product photography, content creator equipment, no people, neutral background, realistic proportions'
  },

  // Smart Home
  {
    category: 'Smart Home',
    categorySlug: 'smart-home',
    keyword: 'cel mai bun sistem de securitate pentru casă',
    imagePrompt: 'Ultra-realistic photo of a premium home security system, control panel, wireless sensors, smart cameras, modern sleek design, displayed in contemporary home entrance, soft natural daylight, high detail texture, sharp focus, professional product photography, smart home technology, no people, neutral background, realistic proportions'
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
    keyword: 'cel mai bun robot aspirator premium cu golire automată',
    imagePrompt: 'Ultra-realistic photo of a premium robot vacuum cleaner with auto-empty dock, sleek round design, modern minimalist style, placed in bright contemporary living room, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, smart home appliance, no people, neutral background, realistic proportions'
  },
  {
    category: 'Smart Home',
    categorySlug: 'smart-home',
    keyword: 'cel mai bun termostat inteligent premium',
    imagePrompt: 'Ultra-realistic photo of a premium smart thermostat, sleek round or square design, digital display showing temperature, mounted on modern white wall, soft natural daylight, clean reflections, high detail texture, sharp focus, professional product photography, smart home device, no people, neutral background, realistic proportions'
  },
  {
    category: 'Smart Home',
    categorySlug: 'smart-home',
    keyword: 'cel mai bun sistem smart home complet',
    imagePrompt: 'Ultra-realistic photo of a complete smart home system, smart hub, voice assistant, smart lights, smart plugs arranged together, modern minimalist design, placed in contemporary living room setting, soft natural daylight, high detail texture, sharp focus, professional product photography, smart home technology, no people, neutral background, realistic proportions'
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

      // Download and compress image
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

          // Compress with sharp to WebP
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

REGULI SEO OBLIGATORII:
1. Articolul trebuie sa aiba MINIM 1500 de cuvinte si MAXIM 2000 de cuvinte
2. Keyword-ul "${keyword}" TREBUIE sa apara in PRIMUL paragraf al articolului
3. Densitatea keyword-ului trebuie sa fie 1-2% (keyword-ul sa apara de 15-25 ori in tot articolul, natural integrat)
4. Foloseste sinonime si variații ale keyword-ului pentru LSI (Latent Semantic Indexing)

REGULI DE STIL:
1. NU folosi NICIODATA aceste cuvinte/expresii: "ghid", "concluzie", "în concluzie", "drept urmare", "așadar", "cu toate acestea", "în primul rând", "în al doilea rând", "de asemenea", "mai mult decât atât", "în ceea ce privește", "totodată", "prin urmare", "fără îndoială", "cu siguranță"
2. Scrie natural, ca un expert care vorbește cu un prieten
3. Folosește un ton conversational dar profesionist
4. Include date tehnice concrete, specificații reale
5. Menționează branduri și modele reale (fără prețuri exacte)
6. Fiecare paragraf trebuie sa aiba minim 3-4 propoziții

STRUCTURA ARTICOLULUI:
1. EXCERPT: 1-2 propoziții care rezumă articolul (pentru meta description, max 160 caractere)
2. INTRODUCERE (prima secțiune): 3-4 paragrafe care prezintă subiectul, INCLUDE keyword-ul in primul paragraf
3. 6-8 SECȚIUNI H2: Fiecare cu 3-5 paragrafe substanțiale și eventual subsecțiuni H3
4. FAQ: 5 întrebări frecvente cu răspunsuri detaliate (pentru schema FAQ)

FORMAT RASPUNS (JSON strict):
{
  "excerpt": "Meta description scurt, max 160 caractere",
  "sections": [
    {
      "heading": "Titlu sectiune H2 (introducerea nu are heading, doar content)",
      "content": "Continut paragraf 1...\\n\\nContinut paragraf 2...\\n\\nContinut paragraf 3...",
      "subsections": [
        {
          "heading": "Titlu H3 optional",
          "content": "Continut detaliat..."
        }
      ]
    }
  ],
  "faq": [
    {
      "question": "Intrebare?",
      "answer": "Raspuns detaliat de minim 2-3 propoziții."
    }
  ]
}

IMPORTANT:
- Raspunde DOAR cu JSON valid, fara markdown code blocks sau alte caractere
- NU include campul "title" in JSON, titlul va fi keyword-ul
- Prima sectiune este INTRODUCEREA si trebuie sa contina keyword-ul in primul paragraf
- Scrie paragrafe lungi si substantiale, nu propozitii scurte`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16000
        }
      })
    });

    const rawText = await response.text();
    console.log('  API Response status:', response.status);

    if (!response.ok) {
      console.error('  API Error:', rawText.substring(0, 500));
      throw new Error(`API returned ${response.status}: ${rawText.substring(0, 200)}`);
    }

    const data = JSON.parse(rawText);
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.error('  Empty response from API:', JSON.stringify(data).substring(0, 500));
      throw new Error('Empty response from Gemini API');
    }

    // Clean up response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    return JSON.parse(text);
  } catch (error) {
    console.error('Content generation error:', error.message);
    throw error;
  }
}

// ========== CREATE ASTRO FILE ==========
async function createAstroFile(article, content, imagePath) {
  // Title is the keyword (capitalized)
  const simpleTitle = article.keyword.charAt(0).toUpperCase() + article.keyword.slice(1);
  const slug = slugify(simpleTitle);
  const publishDate = new Date().toISOString().split('T')[0];
  const author = getNextAuthor();

  // Use excerpt from API or extract from first paragraph
  const excerpt = content.excerpt || content.sections[0]?.content?.split('\n')[0]?.substring(0, 160) + '...';

  // Build table of contents
  const toc = content.sections.map((s, i) => ({
    id: `sectiune-${i + 1}`,
    title: s.heading
  }));

  // Build TOC links HTML
  const tocLinks = toc.map(item =>
    `<a href="#${item.id}" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">${item.title}</a>`
  ).join('\n                ') + '\n                <a href="#faq" class="block text-sm text-slate-600 hover:text-primary-600 transition-colors py-1">Intrebari frecvente</a>';

  // Build sections HTML - convert markdown to HTML
  let sectionsHtml = '';
  content.sections.forEach((section, i) => {
    let sectionContent = section.content;

    // Convert markdown bold to HTML
    sectionContent = sectionContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert markdown lists to HTML lists
    const lines = sectionContent.split('\n');
    let processedLines = [];
    let inList = false;
    let listItems = [];

    for (const line of lines) {
      const listMatch = line.match(/^\*\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(listMatch[1]);
      } else {
        if (inList && listItems.length > 0) {
          processedLines.push('<ul class="list-disc list-inside mb-4 space-y-2">');
          listItems.forEach(item => processedLines.push(`  <li>${item}</li>`));
          processedLines.push('</ul>');
          inList = false;
          listItems = [];
        }
        if (line.trim()) {
          processedLines.push(line);
        }
      }
    }
    if (inList && listItems.length > 0) {
      processedLines.push('<ul class="list-disc list-inside mb-4 space-y-2">');
      listItems.forEach(item => processedLines.push(`  <li>${item}</li>`));
      processedLines.push('</ul>');
    }

    const paragraphs = processedLines
      .filter(p => p.trim() && !p.startsWith('<ul') && !p.startsWith('</ul') && !p.startsWith('  <li'))
      .map(p => `<p class="mb-4">${p}</p>`);

    const lists = processedLines.filter(p => p.startsWith('<ul') || p.startsWith('</ul') || p.startsWith('  <li')).join('\n    ');

    sectionsHtml += `
  <section id="sectiune-${i + 1}" class="mb-10">
    <h2 class="text-2xl font-bold text-slate-900 mb-4">${section.heading}</h2>
    ${paragraphs.join('\n    ')}
    ${lists}
    ${section.subsections ? section.subsections.map(sub => `
    <h3 class="text-xl font-semibold text-slate-800 mt-6 mb-3">${sub.heading}</h3>
    ${sub.content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').split('\n').filter(p => p.trim()).map(p => `<p class="mb-4">${p}</p>`).join('\n    ')}`).join('') : ''}
  </section>`;
  });

  // Build FAQ schema
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
  title: "${simpleTitle.replace(/"/g, '\\"')}",
  slug: "${slug}",
  category: "${article.category}",
  categorySlug: "${article.categorySlug}",
  excerpt: "${excerpt.replace(/"/g, '\\"')}",
  image: "${imagePath || '/images/placeholder.webp'}",
  publishDate: "${publishDate}",
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
  faqSchema={${JSON.stringify(faqSchema, null, 2).split('\n').join('\n  ')}}
>
  <article class="bg-white">
    <!-- Hero -->
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
        <!-- Sidebar - Cuprins -->
        <aside class="lg:col-span-1">
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
                ${tocLinks}
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
                ${tocLinks}
                </nav>
              </details>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <div class="lg:col-span-3 prose-custom">
          ${imagePath ? `<img src="${imagePath}" alt="${simpleTitle}" class="w-full rounded-xl mb-8 shadow-lg" loading="eager" />` : ''}

          ${sectionsHtml}

          <!-- FAQ Section -->
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

          <!-- RELATED_ARTICLES_PLACEHOLDER -->
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
  console.log('ARTICLE GENERATION SCRIPT');
  console.log('='.repeat(60));
  console.log(`Total articles: ${articles.length}`);
  console.log(`Image model: ${IMAGE_MODEL} (FREE)`);
  console.log('='.repeat(60));

  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i + 1}/${articles.length}] Processing: ${article.keyword}`);
    console.log('-'.repeat(50));

    let retries = 3;
    while (retries > 0) {
      try {
        // Generate content with retry
        console.log('  Generating content with Gemini...');
        const content = await generateArticleContent(article.keyword, article.category);
        console.log(`  Title: ${article.keyword.charAt(0).toUpperCase() + article.keyword.slice(1)}`);

        // Small delay to avoid rate limits
        await delay(1000);

        // Generate image using predefined prompt
        const imagePath = await generateImage(article.imagePrompt, slugify(content.title));

        // Small delay
        await delay(1000);

        // Create Astro file
        const slug = await createAstroFile(article, content, imagePath);

        results.push({
          keyword: article.keyword,
          title: content.title,
          slug,
          status: 'success'
        });

        console.log(`  SUCCESS!`);

        // Delay between articles to respect rate limits
        if (i < articles.length - 1) {
          console.log('  Waiting 3 seconds before next article...');
          await delay(3000);
        }
        break; // Success, exit retry loop

      } catch (error) {
        retries--;
        if (retries > 0) {
          const isRateLimit = error.message.includes('429') || error.message.includes('quota');
          const waitTime = isRateLimit ? 60000 : 3000; // 60s for rate limit, 3s for other errors
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

  // Summary
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
      console.log(`  - ${r.keyword}: ${r.error}`);
    });
  }

  // Save results log
  await fs.writeFile(
    path.join(process.cwd(), 'generation-log.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log('\nResults saved to generation-log.json');
}

main().catch(console.error);
