import fs from 'fs/promises';
import path from 'path';

// Lista de autori
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

// Mapping keyword -> titlu simplu
const KEYWORD_MAP = {
  'tehnologie-gaming': {
    'pc-de-gaming': 'Cel mai bun PC de gaming high-end',
    'laptop-de-gaming': 'Cel mai bun laptop de gaming RTX 4090',
    'monitor-oled': 'Cel mai bun monitor OLED pentru gaming',
    'scaun-de-gaming': 'Cel mai bun scaun de gaming premium',
    'sistem-vr': 'Cel mai bun sistem VR profesional'
  },
  'electrocasnice': {
    'frigider': 'Cel mai bun frigider side by side premium',
    'masina-de-spalat': 'Cea mai bună mașină de spălat rufe premium',
    'uscator': 'Cel mai bun uscător de rufe cu pompă de căldură',
    'cuptor': 'Cel mai bun cuptor încorporabil premium',
    'plita': 'Cea mai bună plită cu inducție premium'
  },
  'tv-audio': {
    'televizor-oled': 'Cel mai bun televizor OLED 4K',
    'televizor-qled': 'Cel mai bun televizor QLED de mari dimensiuni',
    'home-cinema': 'Cel mai bun sistem home cinema 7.1',
    'soundbar': 'Cel mai bun soundbar Dolby Atmos',
    'televizor-gaming': 'Cel mai bun televizor pentru gaming console'
  },
  'foto-video': {
    'mirrorless': 'Cel mai bun aparat foto mirrorless full frame',
    'camera-video': 'Cea mai bună cameră video profesională 4K',
    'obiectiv': 'Cel mai bun obiectiv foto profesional',
    'gimbal': 'Cel mai bun gimbal profesional pentru cameră',
    'vlogging': 'Cel mai bun setup pentru vlogging profesional'
  },
  'smart-home': {
    'securitate': 'Cel mai bun sistem de securitate pentru casă',
    'camere-supraveghere': 'Cele mai bune camere de supraveghere wireless premium',
    'robot-aspirator': 'Cel mai bun robot aspirator premium cu golire automată',
    'termostat': 'Cel mai bun termostat inteligent premium',
    'smart-home': 'Cel mai bun sistem smart home complet'
  }
};

// Funcție pentru a determina keyword-ul din slug
function getKeywordFromSlug(slug, categorySlug) {
  const slugLower = slug.toLowerCase();

  // Mapări directe bazate pe conținutul slug-ului
  if (slugLower.includes('pc-de-gaming') || slugLower.includes('pc-gaming') || (slugLower.includes('gaming') && slugLower.includes('high-end'))) {
    return 'Cel mai bun PC de gaming high-end';
  }
  if (slugLower.includes('laptop') && slugLower.includes('gaming')) {
    return 'Cel mai bun laptop de gaming RTX 4090';
  }
  if (slugLower.includes('monitor') && slugLower.includes('oled')) {
    return 'Cel mai bun monitor OLED pentru gaming';
  }
  if (slugLower.includes('scaun') && slugLower.includes('gaming')) {
    return 'Cel mai bun scaun de gaming premium';
  }
  if (slugLower.includes('vr') || slugLower.includes('virtual')) {
    return 'Cel mai bun sistem VR profesional';
  }
  if (slugLower.includes('frigider') || slugLower.includes('side-by-side')) {
    return 'Cel mai bun frigider side by side premium';
  }
  if (slugLower.includes('masina') && slugLower.includes('spalat')) {
    return 'Cea mai bună mașină de spălat rufe premium';
  }
  if (slugLower.includes('uscator') || slugLower.includes('pompa-de-caldura')) {
    return 'Cel mai bun uscător de rufe cu pompă de căldură';
  }
  if (slugLower.includes('cuptor')) {
    return 'Cel mai bun cuptor încorporabil premium';
  }
  if (slugLower.includes('plita') || slugLower.includes('inductie')) {
    return 'Cea mai bună plită cu inducție premium';
  }
  if (slugLower.includes('televizor') && slugLower.includes('oled') && !slugLower.includes('gaming')) {
    return 'Cel mai bun televizor OLED 4K';
  }
  if (slugLower.includes('televizor') && slugLower.includes('qled')) {
    return 'Cel mai bun televizor QLED de mari dimensiuni';
  }
  if (slugLower.includes('home-cinema') || slugLower.includes('home cinema') || slugLower.includes('7-1')) {
    return 'Cel mai bun sistem home cinema 7.1';
  }
  if (slugLower.includes('soundbar') || slugLower.includes('dolby')) {
    return 'Cel mai bun soundbar Dolby Atmos';
  }
  if (slugLower.includes('televizor') && slugLower.includes('gaming')) {
    return 'Cel mai bun televizor pentru gaming console';
  }
  if (slugLower.includes('mirrorless') || slugLower.includes('aparat-foto')) {
    return 'Cel mai bun aparat foto mirrorless full frame';
  }
  if (slugLower.includes('camera-video') || slugLower.includes('camera') && slugLower.includes('4k')) {
    return 'Cea mai bună cameră video profesională 4K';
  }
  if (slugLower.includes('obiectiv')) {
    return 'Cel mai bun obiectiv foto profesional';
  }
  if (slugLower.includes('gimbal')) {
    return 'Cel mai bun gimbal profesional pentru cameră';
  }
  if (slugLower.includes('vlogging') || slugLower.includes('vlog')) {
    return 'Cel mai bun setup pentru vlogging profesional';
  }
  if (slugLower.includes('securitate') && !slugLower.includes('camere')) {
    return 'Cel mai bun sistem de securitate pentru casă';
  }
  if (slugLower.includes('camere') && slugLower.includes('supraveghere')) {
    return 'Cele mai bune camere de supraveghere wireless premium';
  }
  if (slugLower.includes('robot') && slugLower.includes('aspirator')) {
    return 'Cel mai bun robot aspirator premium cu golire automată';
  }
  if (slugLower.includes('termostat')) {
    return 'Cel mai bun termostat inteligent premium';
  }
  if (slugLower.includes('smart-home') || slugLower.includes('smart home')) {
    return 'Cel mai bun sistem smart home complet';
  }

  return null;
}

// Funcție pentru a extrage primul paragraf din conținut
function extractFirstParagraph(content) {
  // Căutăm primul <p> din conținut după imagine
  const pMatch = content.match(/<p class="mb-4">([^<]+)<\/p>/);
  if (pMatch && pMatch[1]) {
    let excerpt = pMatch[1].trim();
    // Limităm la ~160 caractere pentru meta description
    if (excerpt.length > 160) {
      excerpt = excerpt.substring(0, 157) + '...';
    }
    return excerpt;
  }
  return null;
}

// Funcție pentru a selecta un autor bazat pe index (consistent)
function getAuthor(index) {
  return AUTHORS[index % AUTHORS.length];
}

async function updateArticles() {
  const pagesDir = path.join(process.cwd(), 'src', 'pages');
  const files = await fs.readdir(pagesDir);

  // Filtrăm doar articolele (exclude index, contact, category, pagini legale)
  const articleFiles = files.filter(f =>
    f.endsWith('.astro') &&
    !['index.astro', 'contact.astro', '[category].astro',
      'politica-de-confidentialitate.astro', 'termeni-si-conditii.astro',
      'politica-cookies.astro'].includes(f)
  );

  console.log(`Found ${articleFiles.length} articles to update`);

  let updated = 0;

  for (let i = 0; i < articleFiles.length; i++) {
    const file = articleFiles[i];
    const filePath = path.join(pagesDir, file);

    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // Extragem slug-ul și categorySlug din frontmatter
      const slugMatch = content.match(/slug:\s*"([^"]+)"/);
      const categorySlugMatch = content.match(/categorySlug:\s*"([^"]+)"/);

      if (!slugMatch || !categorySlugMatch) {
        console.log(`  Skipping ${file} - no slug or categorySlug found`);
        continue;
      }

      const slug = slugMatch[1];
      const categorySlug = categorySlugMatch[1];

      // Determinăm noul titlu (keyword simplu)
      const newTitle = getKeywordFromSlug(slug, categorySlug);
      if (!newTitle) {
        console.log(`  Could not determine keyword for ${file}`);
        continue;
      }

      // Extragem primul paragraf pentru excerpt
      const newExcerpt = extractFirstParagraph(content);

      // Selectăm autor
      const author = getAuthor(i);

      // Actualizăm titlul în frontmatter
      content = content.replace(
        /title:\s*"[^"]+"/,
        `title: "${newTitle.replace(/"/g, '\\"')}"`
      );

      // Actualizăm excerpt dacă am găsit unul
      if (newExcerpt) {
        content = content.replace(
          /excerpt:\s*"[^"]+"/,
          `excerpt: "${newExcerpt.replace(/"/g, '\\"')}"`
        );
      }

      // Actualizăm autorul
      content = content.replace(
        /author:\s*"[^"]+"/,
        `author: "${author}"`
      );

      // Actualizăm și titlul în h1 dacă există
      // (păstrăm h1 cu noul titlu)

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`  Updated: ${file}`);
      console.log(`    Title: ${newTitle}`);
      console.log(`    Author: ${author}`);
      updated++;

    } catch (error) {
      console.error(`  Error updating ${file}:`, error.message);
    }
  }

  console.log(`\nUpdated ${updated}/${articleFiles.length} articles`);
}

updateArticles().catch(console.error);
