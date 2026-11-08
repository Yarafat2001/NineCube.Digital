import type { Product, ProductImage } from '../api/types';

export interface ResolvedProductImages {
  primaryUrl: string | null;
  primaryAlt: string;
  secondaryUrl: string | null;
  secondaryAlt: string | null;
}

/**
 * Resolves authentic Bangladeshi dual product images (Packet view & Open/Inside view).
 * Even if an API response only returns a single image or an older slug URL, this resolver
 * maps products to their verified, high-resolution retail packaging and interior views.
 */
export function resolveDualProductImages(
  product: Product,
  imagesOverride?: ProductImage[] | null
): ResolvedProductImages {
  const gallery = imagesOverride ?? product.images ?? [];
  const primaryFromGallery = gallery.find((img) => img.isPrimary) ?? gallery[0];
  const secondaryFromGallery =
    gallery.find((img) => !img.isPrimary) ?? (gallery.length > 1 ? gallery[1] : null);

  const hasDbMedia = gallery.length > 0 || !!product.imageUrl;

  let primaryUrl: string | null = primaryFromGallery?.url ?? product.imageUrl ?? null;
  let secondaryUrl: string | null = secondaryFromGallery?.url ?? null;
  let primaryAlt = primaryFromGallery?.altText ?? product.name;
  let secondaryAlt = secondaryFromGallery?.altText ?? `${product.name} (Inside View)`;

  const slug = (product.slug || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const category = (product.categories?.[0]?.slug || '').toLowerCase();

  // Safety: Prevent books, stationery, phones, electronics, bedding, furniture from ever falsely matching rice
  const nonRiceCategory =
    category === 'books' ||
    category === 'stationery' ||
    category === 'school-items' ||
    category === 'office-supplies' ||
    category === 'exam-prep' ||
    category === 'smartphones' ||
    category === 'feature-phones' ||
    category === 'phones' ||
    category === 'mobile-phones' ||
    category === 'electronics' ||
    category === 'home-appliances' ||
    category === 'furniture' ||
    category === 'home-furniture' ||
    category === 'bedding-linen' ||
    category === 'decor-lighting' ||
    category === 'kitchenware' ||
    category === 'toys-kids-baby' ||
    category === 'baby-gear' ||
    category === 'fashion' ||
    category === 'fashion-jewelry' ||
    category === 'online-learning' ||
    slug.includes('cooker') ||
    slug.includes('fisher-price') ||
    name.includes('cooker');

  const isRice =
    !nonRiceCategory &&
    (category === 'rice' ||
      /\b(?:rice|chal|chinigura|miniket|najirshail|nazirshail|kalijeera|kalijira|atap|basmati)\b/i.test(`${slug} ${name}`));

  if (nonRiceCategory) {
    if (primaryUrl && (primaryUrl.includes('rice') || primaryUrl.includes('chinigura'))) {
      primaryUrl = null;
    }
    if (secondaryUrl && (secondaryUrl.includes('rice') || secondaryUrl.includes('chinigura'))) {
      secondaryUrl = null;
    }
  }

  // 1. Authentic Bangladeshi Rice Varieties (Distinct Variety & Weight Imagery)
  if (isRice) {
    const isMiniket = /\bminiket\b/i.test(`${slug} ${name}`);
    const isNajirshail = /\b(?:najirshail|nazirshail)\b/i.test(`${slug} ${name}`);
    const isKalijeera = /\b(?:kalijeera|kalijira)\b/i.test(`${slug} ${name}`);
    const isAtap = /\b(?:atap|atop)\b/i.test(`${slug} ${name}`);
    const isBasmati = /\bbasmati\b/i.test(`${slug} ${name}`);

    const is10kg = slug.includes('10kg') || name.includes('10kg');
    const is5kg = slug.includes('5kg') || name.includes('5kg');
    const is2kg = slug.includes('2kg') || name.includes('2kg');
    const is1kg = slug.includes('1kg') || name.includes('1kg');
    const isExport = slug.includes('export') || name.includes('export');
    const isValue = slug.includes('value') || name.includes('value');
    const isCombo = slug.includes('combo') || name.includes('combo') || slug.includes('twin');

    const sz = is10kg ? '10kg' : is5kg ? '5kg' : is2kg ? '2kg' : is1kg ? '1kg' : '10kg';

    if (slug.includes('bashundhara') || name.includes('bashundhara')) {
      if (isMiniket) {
        primaryUrl = `/products/bd/canonical_bashundhara_miniket_packet_${isExport ? 'export' : isValue ? 'value' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_miniket_rice_open.jpg';
        secondaryAlt = `${product.name} (Slender Polished Miniket Grains)`;
      } else if (isNajirshail) {
        primaryUrl = `/products/bd/canonical_bashundhara_najirshail_packet_${isExport ? 'export' : isValue ? 'value' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_najirshail_rice_open.jpg';
        secondaryAlt = `${product.name} (Pointed Translucent Najirshail Grains)`;
      } else if (isKalijeera) {
        primaryUrl = `/products/bd/canonical_bashundhara_kalijeera_packet_${isExport ? 'export' : isValue ? 'value' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_kalijeera_rice_open.jpg';
        secondaryAlt = `${product.name} (Tiny Aromatic Kalijeera Polao Grains)`;
      } else if (isAtap) {
        primaryUrl = `/products/bd/canonical_bashundhara_atap_packet_${isValue ? 'value' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_atap_rice_open.jpg';
        secondaryAlt = `${product.name} (Sun-Dried Pure White Atap Grains)`;
      } else {
        // Chinigura Aromatic
        primaryUrl = `/products/bd/canonical_bashundhara_chinigura_packet_${isExport ? 'export' : isValue ? 'value' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_chinigura_rice_open.jpg';
        secondaryAlt = `${product.name} (Aromatic Chinigura Grains)`;
      }
    } else if (slug.includes('pran') || name.includes('pran')) {
      if (isAtap) {
        // Must NEVER show Chinigura for PRAN Atap Rice!
        primaryUrl = `/products/bd/canonical_pran_atap_packet_${isCombo ? 'combo' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_atap_rice_open.jpg';
        secondaryAlt = `${product.name} (Pure White Sun-Dried Atap Grains)`;
      } else if (isMiniket) {
        primaryUrl = `/products/bd/canonical_pran_miniket_packet_${isCombo ? 'combo' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_miniket_rice_open.jpg';
        secondaryAlt = `${product.name} (Long Slender Polished Miniket Grains)`;
      } else if (isNajirshail) {
        primaryUrl = `/products/bd/canonical_pran_najirshail_packet_${isCombo ? 'combo' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_najirshail_rice_open.jpg';
        secondaryAlt = `${product.name} (Firm Pointed Najirshail Grains)`;
      } else if (isKalijeera) {
        primaryUrl = `/products/bd/canonical_pran_kalijeera_packet_${isCombo ? 'combo' : sz}.jpg`;
        secondaryUrl = '/products/bd/canonical_kalijeera_rice_open.jpg';
        secondaryAlt = `${product.name} (Tiny Aromatic Polao Rice Grains)`;
      } else {
        // PRAN Chinigura
        primaryUrl = is2kg ? '/products/bd/canonical_pran_chinigura_packet_2kg.jpg' : '/products/bd/canonical_pran_rice_packet.jpg';
        secondaryUrl = '/products/bd/canonical_chinigura_rice_open.jpg';
        secondaryAlt = `${product.name} (Aromatic Chinigura Grains View)`;
      }
    } else if (slug.includes('aci') || name.includes('aci')) {
      primaryUrl = isMiniket
        ? '/products/bd/canonical_aci_miniket_packet.jpg'
        : '/products/bd/canonical_aci_nazirshail_packet.jpg';
      secondaryUrl = isMiniket
        ? '/products/bd/canonical_miniket_rice_open.jpg'
        : '/products/bd/canonical_najirshail_rice_open.jpg';
      secondaryAlt = `${product.name} (Grain Quality View)`;
    } else if (slug.includes('chashi') || name.includes('chashi')) {
      primaryUrl = '/products/bd/canonical_chashi_rice_packet.jpg';
      secondaryUrl = '/products/bd/canonical_chinigura_rice_open.jpg';
      secondaryAlt = `${product.name} (Aromatic Grains View)`;
    } else if (slug.includes('fresh') || name.includes('fresh')) {
      primaryUrl = '/products/bd/canonical_fresh_rice_packet.jpg';
      secondaryUrl = isAtap ? '/products/bd/canonical_atap_rice_open.jpg' : '/products/bd/canonical_chinigura_rice_open.jpg';
      secondaryAlt = `${product.name} (Aromatic Grains View)`;
    } else if (isBasmati) {
      primaryUrl = '/products/bd/canonical_basmati_rice_packet.jpg';
      secondaryUrl = '/products/bd/canonical_miniket_rice_open.jpg';
      secondaryAlt = `${product.name} (Long Slender Basmati Grains)`;
    } else {
      primaryUrl = '/products/bd/canonical_rupchanda_rice_packet.jpg';
      secondaryUrl = '/products/bd/canonical_chinigura_rice_open.jpg';
      secondaryAlt = `${product.name} (Aromatic Grains View)`;
    }
    primaryAlt = `${product.name} (Packet View)`;
  }
  // 2. Mustard Oil (Zero Idlis)
  else if (slug.includes('mustard-oil') || name.includes('mustard oil')) {
    if (slug.includes('fresh') || name.includes('fresh')) {
      primaryUrl = '/products/bd/canonical_fresh_mustard_packet.jpg';
    } else if (slug.includes('pran') || name.includes('pran')) {
      primaryUrl = '/products/bd/canonical_pran_mustard_packet.jpg';
    } else {
      primaryUrl = '/products/bd/canonical_radhuni_mustard_packet.jpg';
    }
    secondaryUrl = '/products/bd/canonical_mustard_oil_open.jpg';
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Pure Golden Mustard Seeds)`;
  }
  // 3. Extra Virgin Olive Oil (Zero Avocados)
  else if (slug.includes('olive-oil') || name.includes('olive oil')) {
    primaryUrl = slug.includes('5l')
      ? '/products/bd/canonical_olive_oil_5l_packet.jpg'
      : '/products/bd/canonical_olive_oil_packet.jpg';
    secondaryUrl = '/products/bd/canonical_olive_oil_open.jpg';
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Pure Extra Virgin Olive Oil & Whole Olives)`;
  }
  // 4. Soybean / Cooking Oil (Guard against automotive engine oil or hair oil)
  else if (
    (slug.includes('soybean') || name.includes('soybean') || slug.includes('palm-oil') || category === 'cooking-oil') &&
    !slug.includes('engine') && !slug.includes('gear') && !slug.includes('hair-oil') && !slug.includes('beard') && !slug.includes('fish-oil')
  ) {
    if (slug.includes('fresh') || name.includes('fresh')) {
      primaryUrl = '/products/bd/canonical_fresh_soybean_packet.jpg';
    } else if (slug.includes('rupchanda') || name.includes('rupchanda')) {
      primaryUrl = '/products/bd/canonical_rupchanda_soybean_packet.jpg';
    } else {
      primaryUrl = '/products/bd/canonical_teer_soybean_packet.jpg';
    }
    secondaryUrl = null;
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Cooking Oil View)`;
  }
  // 5. Anklet / Payel Jewelry (Zero Necklaces)
  else if (slug.includes('anklet') || name.includes('anklet') || name.includes('payel') || name.includes('nupur')) {
    if (slug.includes('silver') || name.includes('silver') || slug.includes('oxidized') || name.includes('oxidized')) {
      primaryUrl = '/products/bd/canonical_anklet_silver_packet.jpg';
      secondaryUrl = '/products/bd/canonical_anklet_silver_open.jpg';
      primaryAlt = `${product.name} (Jewelry Gift Box)`;
      secondaryAlt = `${product.name} (Handcrafted Traditional Oxidized Silver Payel with Bells)`;
    } else {
      primaryUrl = '/products/bd/canonical_anklet_gold_packet.jpg';
      secondaryUrl = '/products/bd/canonical_anklet_gold_open.jpg';
      primaryAlt = `${product.name} (Luxury Gift Box)`;
      secondaryAlt = `${product.name} (Traditional Gold Plated Payel on Ankle with Ghungroo)`;
    }
  }
  // 6. Baby Winter Sets (Zero Girls in Floral Shirts)
  else if (slug.includes('baby-winter') || name.includes('baby winter') || (slug.includes('winter-set') && slug.includes('baby'))) {
    primaryUrl = '/products/bd/canonical_baby_winter_packet.jpg';
    secondaryUrl = (slug.includes('new-edition') || name.includes('new edition'))
      ? '/products/bd/canonical_baby_winter_new_open.jpg'
      : '/products/bd/canonical_baby_winter_open.jpg';
    primaryAlt = `${product.name} (Packaging Box)`;
    secondaryAlt = `${product.name} (Hand-Knitted Woolen Baby Winter Sweater & Set)`;
  }
  // 7. 10 Minute School Courses (Distinct Course Cards & Dashboards)
  else if (slug.includes('10-minute-school') || name.includes('10 minute school') || category === 'online-learning') {
    if (slug.includes('freelancing-masterclass-certificate-plus') || (slug.includes('freelancing') && slug.includes('plus'))) {
      primaryUrl = '/products/bd/canonical_10ms_freelancing_plus_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_freelancing_plus_open.jpg';
      primaryAlt = `${product.name} (VIP Cohort Certification Card)`;
      secondaryAlt = `${product.name} (VIP Agency Incubator Portal)`;
    } else if (slug.includes('freelancing') || name.includes('freelancing')) {
      primaryUrl = '/products/bd/canonical_10ms_freelancing_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_freelancing_open.jpg';
      primaryAlt = `${product.name} (Course Certification Card)`;
      secondaryAlt = `${product.name} (Student Learning & Proposal Dashboard)`;
    } else if (slug.includes('ielts') || name.includes('ielts')) {
      primaryUrl = '/products/bd/canonical_10ms_ielts_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_ielts_open.jpg';
      primaryAlt = `${product.name} (IELTS Band 8.0+ Mastery Card)`;
      secondaryAlt = `${product.name} (Full Mock Diagnostic Dashboard)`;
    } else if (slug.includes('python') || name.includes('python')) {
      primaryUrl = '/products/bd/canonical_10ms_python_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_python_open.jpg';
      primaryAlt = `${product.name} (Python Live Batch Card)`;
      secondaryAlt = `${product.name} (Interactive Cloud IDE & Terminal)`;
    } else {
      primaryUrl = '/products/bd/canonical_10ms_general_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_general_open.jpg';
      primaryAlt = `${product.name} (Official Course Card)`;
      secondaryAlt = `${product.name} (Interactive Learning Dashboard)`;
    }
  }
  // 8. Spices
  else if (slug.includes('turmeric') || name.includes('turmeric')) {
    primaryUrl = '/products/bd/canonical_radhuni_turmeric_packet.jpg';
    secondaryUrl = '/products/bd/canonical_turmeric_open.jpg';
    primaryAlt = `${product.name} (Retail Spice Pack)`;
    secondaryAlt = `${product.name} (Fresh Turmeric Roots & Pure Ground Powder)`;
  } else if (slug.includes('chilli') || name.includes('chilli')) {
    primaryUrl = '/products/bd/canonical_radhuni_chilli_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('coriander') || name.includes('coriander')) {
    primaryUrl = '/products/bd/canonical_radhuni_coriander_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('cumin') || name.includes('cumin')) {
    primaryUrl = '/products/bd/canonical_radhuni_cumin_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('biryani') || name.includes('biryani')) {
    primaryUrl = '/products/bd/canonical_radhuni_biryani_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('garam-masala') || name.includes('garam masala')) {
    primaryUrl = '/products/bd/canonical_radhuni_garam_masala_packet.jpg';
    secondaryUrl = null;
  }
  // 9. Dairy & Yogurt
  else if (slug.includes('sweet-yogurt') || name.includes('sweet yogurt')) {
    primaryUrl = '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg';
    secondaryUrl = '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg';
    primaryAlt = `${product.name} (Clay Pot Packaging)`;
    secondaryAlt = `${product.name} (Creamy Sweet Mishti Doi View)`;
  } else if (slug.includes('ghee') || name.includes('ghee')) {
    primaryUrl = '/products/bd/canonical_aarong_ghee_packet.jpg';
    secondaryUrl = '/products/bd/canonical_aarong_ghee_packet.jpg';
  } else if (slug.includes('liquid-milk') || name.includes('liquid milk') || slug.includes('uht-milk')) {
    primaryUrl = '/products/bd/canonical_aarong_liquid_milk_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('roshogolla') || name.includes('roshogolla')) {
    primaryUrl = '/products/bd/canonical_aarong_roshogolla_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('powder-milk') || slug.includes('milk-powder')) {
    primaryUrl = slug.includes('marks')
      ? '/products/bd/canonical_marks_milk_powder_packet.jpg'
      : '/products/bd/canonical_dano_powder_milk_packet.jpg';
    secondaryUrl = null;
  }
  // 10. Snacks & Sweets
  else if (slug.includes('chanachur') || name.includes('chanachur')) {
    primaryUrl = '/products/bd/canonical_bombay_chanachur_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('biscuit') || slug.includes('energy') || name.includes('biscuit')) {
    primaryUrl = '/products/bd/canonical_olympic_energy_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('noodles') || name.includes('noodles')) {
    primaryUrl = '/products/bd/canonical_maggi_noodles_packet.jpg';
    secondaryUrl = null;
  }
  // 11. Beverages
  else if (slug.includes('tea') || name.includes('tea')) {
    primaryUrl = slug.includes('taaza')
      ? '/products/bd/canonical_taaza_tea_packet.jpg'
      : '/products/bd/canonical_ispahani_tea_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('mojo') || slug.includes('cola')) {
    primaryUrl = '/products/bd/canonical_mojo_cola_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('mango') || slug.includes('litchi')) {
    primaryUrl = slug.includes('mango')
      ? '/products/bd/canonical_pran_mango_packet.jpg'
      : '/products/bd/canonical_pran_litchi_packet.jpg';
    secondaryUrl = null;
  }
  // 12. Staples (Atta, Maida, Dal)
  else if (slug.includes('atta') || name.includes('atta')) {
    primaryUrl = '/products/bd/canonical_atta_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('maida') || name.includes('maida')) {
    primaryUrl = '/products/bd/canonical_maida_packet.jpg';
    secondaryUrl = null;
  } else if (slug.includes('dal') || name.includes('dal') || slug.includes('lentil')) {
    primaryUrl = '/products/bd/canonical_dal_packet.jpg';
    secondaryUrl = null;
  }
  // 13. Laptops & Computers
  else if (category.includes('laptop') || slug.includes('laptop') || name.includes('laptop')) {
    primaryUrl = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp';
    secondaryUrl = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-1-b75f08eb4a.webp';
    primaryAlt = `${product.name} (Closed Lid)`;
    secondaryAlt = `${product.name} (Open Display & Keyboard)`;
  }
  // 14. Smartphones & Feature Phones (Model-Distinct Authentic Imagery)
  else if (category === 'smartphones' || category === 'feature-phones' || category === 'phones' || category === 'mobile-phones' || slug.includes('phone') || slug.includes('galaxy') || slug.includes('iphone') || slug.includes('redmi') || slug.includes('pixel') || slug.includes('nokia') || slug.includes('walton-olvio') || slug.includes('symphony-l')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    if (category === 'feature-phones' || slug.includes('nokia') || slug.includes('olvio') || slug.includes('it56')) {
      primaryAlt = `${product.name} (Keypad & Display View)`;
      secondaryAlt = `${product.name} (Rear Battery Cover View)`;
    } else {
      primaryAlt = `${product.name} (Front Display View)`;
      secondaryAlt = `${product.name} (Rear Chassis & Camera View)`;
    }
  }
  // 15. Authentic Bangladeshi Books & Literature (Zero Rice Fallbacks)
  else if (category === 'books' || slug.includes('poetry') || slug.includes('novel') || slug.includes('paperback') || slug.includes('hardcover') || slug.includes('history-of-bangladesh')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    primaryAlt = `${product.name} (Published Book Cover)`;
    secondaryAlt = `${product.name} (Open Printed Pages Spread)`;
  }
  // 16. Authentic Stationery, School & Office Supplies, Exam Prep
  else if (category === 'stationery' || category === 'school-items' || category === 'office-supplies' || category === 'exam-prep' || slug.includes('highlighter') || slug.includes('ballpoint') || slug.includes('notebook') || slug.includes('gel-pen') || slug.includes('geometry-box') || slug.includes('binder-clip')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    if (category === 'exam-prep') {
      primaryAlt = `${product.name} (Study Guide Cover)`;
      secondaryAlt = `${product.name} (Model Tests & Solutions Spread)`;
    } else {
      primaryAlt = `${product.name} (Retail Packaging)`;
      secondaryAlt = `${product.name} (Precision Nib & Writing View)`;
    }
  }
  // 17. Home, Living, Bedding & Kitchenware (Correct Non-Electronics Grouping)
  else if (category === 'bedding-linen' || slug.includes('bed-sheet') || slug.includes('comforter') || slug.includes('pillow-cover') || slug.includes('quilt-cover')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    primaryAlt = `${product.name} (Luxury Packaging Box)`;
    secondaryAlt = `${product.name} (Open Cotton Bedding Spread)`;
  } else if (category === 'decor-lighting' || slug.includes('smart-bulb') || slug.includes('strip-light') || slug.includes('wall-sconce')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    primaryAlt = `${product.name} (Retail Product Box)`;
    secondaryAlt = `${product.name} (Illuminated Ambient Glow View)`;
  } else if (category === 'kitchenware' || slug.includes('fry-pan') || slug.includes('chef-knife') || slug.includes('mixing-bowl')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    primaryAlt = `${product.name} (Retail Cookware Box)`;
    secondaryAlt = `${product.name} (Cookware Non-Stick Induction Base View)`;
  } else if (category === 'furniture' || category === 'home-furniture' || slug.includes('wardrobe') || slug.includes('tv-unit')) {
    primaryUrl = `/products/bd/${slug}.jpg`;
    secondaryUrl = `/products/bd/${slug}-open.jpg`;
    primaryAlt = `${product.name} (Factory Packaging Crate)`;
    secondaryAlt = `${product.name} (Showroom Assembled Teak Display)`;
  }
  // 15. Apparel (Panjabi, Sarees)
  else if (slug.includes('panjabi') || name.includes('panjabi')) {
    primaryUrl = '/products/bd/canonical_panjabi_embroidered.jpg';
    secondaryUrl = null;
  } else if (slug.includes('saree') || name.includes('saree') || slug.includes('kurti') || slug.includes('three-piece')) {
    primaryUrl = '/products/bd/canonical_saree_jamdani.jpg';
    secondaryUrl = null;
  }
  // 16. Fallback if primaryUrl is not set: use slug image
  if (!primaryUrl) {
    if (!hasDbMedia && !slug) {
      return {
        primaryUrl: null,
        primaryAlt: product.name,
        secondaryUrl: null,
        secondaryAlt: null,
      };
    }
    if (slug) {
      primaryUrl = `/products/bd/${slug}.jpg`;
      secondaryUrl = `/products/bd/${slug}-open.jpg`;
    } else {
      primaryUrl = null;
      secondaryUrl = null;
    }
  }

  // Fallback: if secondaryUrl is not yet set
  if (!secondaryUrl && primaryUrl) {
    if (primaryUrl.includes('_packet.jpg')) {
      secondaryUrl = primaryUrl.replace('_packet.jpg', '_open.jpg');
    } else if (primaryUrl.endsWith('.jpg') && !primaryUrl.includes('-open.jpg') && !primaryUrl.includes('_open.jpg')) {
      secondaryUrl = primaryUrl.replace(/\.jpg$/, '-open.jpg');
    } else {
      secondaryUrl = null;
    }
  }

  return { primaryUrl, primaryAlt, secondaryUrl, secondaryAlt };
}
