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

  // Safety: If gallery image was corrupted with rice images on a non-rice product, discard it!
  const isRice =
    category === 'rice' ||
    slug.includes('rice') ||
    name.includes('rice') ||
    slug.includes('chinigura') ||
    name.includes('chinigura') ||
    slug.includes('chal') ||
    name.includes('chal') ||
    slug.includes('atap') ||
    slug.includes('najirshail') ||
    slug.includes('miniket') ||
    slug.includes('kalijeera');

  if (!isRice) {
    if (primaryUrl && (primaryUrl.includes('rice') || primaryUrl.includes('chinigura'))) {
      primaryUrl = null;
    }
    if (secondaryUrl && (secondaryUrl.includes('rice') || secondaryUrl.includes('chinigura'))) {
      secondaryUrl = null;
    }
  }

  // 1. Chinigura & Rice Staples
  if (isRice) {
    if (slug.includes('bashundhara') || name.includes('bashundhara')) {
      if (slug.includes('10kg') || name.includes('10kg')) {
        primaryUrl = '/products/bd/canonical_bashundhara_rice_packet_10kg.jpg';
      } else if (slug.includes('5kg') || name.includes('5kg')) {
        primaryUrl = '/products/bd/canonical_bashundhara_rice_packet_5kg.jpg';
      } else if (slug.includes('2kg') || name.includes('2kg')) {
        primaryUrl = '/products/bd/canonical_bashundhara_rice_packet_2kg.jpg';
      } else {
        primaryUrl = '/products/bd/canonical_bashundhara_rice_packet_1kg.jpg';
      }
    } else if (slug.includes('pran') || name.includes('pran')) {
      primaryUrl = '/products/bd/canonical_pran_rice_packet.jpg';
    } else if (slug.includes('chashi') || name.includes('chashi')) {
      primaryUrl = '/products/bd/canonical_chashi_rice_packet.jpg';
    } else if (slug.includes('fresh') || name.includes('fresh')) {
      primaryUrl = '/products/bd/canonical_fresh_rice_packet.jpg';
    } else if (slug.includes('miniket') || name.includes('miniket')) {
      primaryUrl = '/products/bd/canonical_aci_miniket_packet.jpg';
    } else if (slug.includes('nazirshail') || name.includes('nazirshail')) {
      primaryUrl = '/products/bd/canonical_aci_nazirshail_packet.jpg';
    } else {
      primaryUrl = '/products/bd/canonical_rupchanda_rice_packet.jpg';
    }
    secondaryUrl = '/products/bd/canonical_chinigura_rice_open.jpg';
    primaryAlt = `${product.name} (Packet View)`;
    secondaryAlt = `${product.name} (Aromatic Grains View)`;
  }
  // 2. Mustard Oil
  else if (slug.includes('mustard-oil') || name.includes('mustard oil')) {
    if (slug.includes('fresh') || name.includes('fresh')) {
      primaryUrl = '/products/bd/canonical_fresh_mustard_packet.jpg';
    } else {
      primaryUrl = '/products/bd/canonical_radhuni_mustard_packet.jpg';
    }
    secondaryUrl = '/products/bd/canonical_mustard_oil_open.jpg';
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Pure Golden Mustard Oil with Seeds)`;
  }
  // 3. Olive Oil
  else if (slug.includes('olive-oil') || name.includes('olive oil')) {
    primaryUrl = '/products/bd/canonical_olive_oil_packet.jpg';
    secondaryUrl = '/products/bd/canonical_olive_oil_open.jpg';
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Pure Extra Virgin Olive Oil & Whole Olives)`;
  }
  // 4. Soybean / Cooking Oil
  else if (slug.includes('soybean') || name.includes('soybean') || slug.includes('palm-oil') || category === 'cooking-oil') {
    primaryUrl = slug.includes('rupchanda')
      ? '/products/bd/canonical_rupchanda_soybean_packet.jpg'
      : '/products/bd/canonical_teer_soybean_packet.jpg';
    secondaryUrl = primaryUrl;
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Cooking Oil View)`;
  }
  // 5. Anklet / Payel Jewelry
  else if (slug.includes('anklet') || name.includes('anklet') || name.includes('payel') || name.includes('nupur')) {
    if (slug.includes('silver') || name.includes('silver')) {
      primaryUrl = '/products/bd/canonical_anklet_silver_packet.jpg';
      secondaryUrl = '/products/bd/canonical_anklet_silver_open.jpg';
      primaryAlt = `${product.name} (Jewelry Gift Box)`;
      secondaryAlt = `${product.name} (Handcrafted Silver Anklet with Bells on Ankle)`;
    } else {
      primaryUrl = '/products/bd/canonical_anklet_gold_packet.jpg';
      secondaryUrl = '/products/bd/canonical_anklet_gold_open.jpg';
      primaryAlt = `${product.name} (Luxury Gift Box)`;
      secondaryAlt = `${product.name} (Traditional Gold Plated Payel on Ankle with Ghungroo)`;
    }
  }
  // 6. Baby Winter Sets
  else if (slug.includes('baby-winter') || name.includes('baby winter') || (slug.includes('winter-set') && slug.includes('baby'))) {
    primaryUrl = '/products/bd/canonical_baby_winter_packet.jpg';
    secondaryUrl = '/products/bd/canonical_baby_winter_open.jpg';
    primaryAlt = `${product.name} (Packaging Box)`;
    secondaryAlt = `${product.name} (Complete Knit Sweater, Pants, Booties & Beanie Set)`;
  }
  // 7. 10 Minute School Courses
  else if (slug.includes('10-minute-school') || name.includes('10 minute school') || category === 'online-learning') {
    if (slug.includes('freelancing') || name.includes('freelancing')) {
      primaryUrl = '/products/bd/canonical_10ms_freelancing_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_freelancing_open.jpg';
    } else if (slug.includes('ielts') || name.includes('ielts')) {
      primaryUrl = '/products/bd/canonical_10ms_ielts_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_ielts_open.jpg';
    } else if (slug.includes('python') || name.includes('python')) {
      primaryUrl = '/products/bd/canonical_10ms_python_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_python_open.jpg';
    } else {
      primaryUrl = '/products/bd/canonical_10ms_general_packet.jpg';
      secondaryUrl = '/products/bd/canonical_10ms_general_open.jpg';
    }
    primaryAlt = `${product.name} (Course Certification Card)`;
    secondaryAlt = `${product.name} (Interactive Student Learning Dashboard)`;
  }
  // 8. Spices
  else if (slug.includes('turmeric') || name.includes('turmeric')) {
    primaryUrl = '/products/bd/canonical_radhuni_turmeric_packet.jpg';
    secondaryUrl = '/products/bd/canonical_turmeric_open.jpg';
    primaryAlt = `${product.name} (Retail Spice Pack)`;
    secondaryAlt = `${product.name} (Fresh Turmeric Roots & Pure Ground Powder)`;
  } else if (slug.includes('chilli') || name.includes('chilli')) {
    primaryUrl = '/products/bd/canonical_radhuni_chilli_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('coriander') || name.includes('coriander')) {
    primaryUrl = '/products/bd/canonical_radhuni_coriander_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('cumin') || name.includes('cumin')) {
    primaryUrl = '/products/bd/canonical_radhuni_cumin_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('biryani') || name.includes('biryani')) {
    primaryUrl = '/products/bd/canonical_radhuni_biryani_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('garam-masala') || name.includes('garam masala')) {
    primaryUrl = '/products/bd/canonical_radhuni_garam_masala_packet.jpg';
    secondaryUrl = primaryUrl;
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
    secondaryUrl = primaryUrl;
  } else if (slug.includes('roshogolla') || name.includes('roshogolla')) {
    primaryUrl = '/products/bd/canonical_aarong_roshogolla_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('powder-milk') || slug.includes('milk-powder')) {
    primaryUrl = slug.includes('marks')
      ? '/products/bd/canonical_marks_milk_powder_packet.jpg'
      : '/products/bd/canonical_dano_powder_milk_packet.jpg';
    secondaryUrl = primaryUrl;
  }
  // 10. Snacks & Sweets
  else if (slug.includes('chanachur') || name.includes('chanachur')) {
    primaryUrl = '/products/bd/canonical_bombay_chanachur_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('biscuit') || slug.includes('energy') || name.includes('biscuit')) {
    primaryUrl = '/products/bd/canonical_olympic_energy_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('noodles') || name.includes('noodles')) {
    primaryUrl = '/products/bd/canonical_maggi_noodles_packet.jpg';
    secondaryUrl = primaryUrl;
  }
  // 11. Beverages
  else if (slug.includes('tea') || name.includes('tea')) {
    primaryUrl = slug.includes('taaza')
      ? '/products/bd/canonical_taaza_tea_packet.jpg'
      : '/products/bd/canonical_ispahani_tea_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('mojo') || slug.includes('cola')) {
    primaryUrl = '/products/bd/canonical_mojo_cola_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('mango') || slug.includes('litchi')) {
    primaryUrl = slug.includes('mango')
      ? '/products/bd/canonical_pran_mango_packet.jpg'
      : '/products/bd/canonical_pran_litchi_packet.jpg';
    secondaryUrl = primaryUrl;
  }
  // 12. Staples (Atta, Maida, Dal)
  else if (slug.includes('atta') || name.includes('atta')) {
    primaryUrl = '/products/bd/canonical_atta_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('maida') || name.includes('maida')) {
    primaryUrl = '/products/bd/canonical_maida_packet.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('dal') || name.includes('dal') || slug.includes('lentil')) {
    primaryUrl = '/products/bd/canonical_dal_packet.jpg';
    secondaryUrl = primaryUrl;
  }
  // 13. Laptops & Computers
  else if (category.includes('laptop') || slug.includes('laptop') || name.includes('laptop')) {
    primaryUrl = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-0-9259d53635.webp';
    secondaryUrl = '/products/laptops/acer-aspire-lite-al15-41-16gb-512gb-1-b75f08eb4a.webp';
    primaryAlt = `${product.name} (Closed Lid)`;
    secondaryAlt = `${product.name} (Open Display & Keyboard)`;
  }
  // 14. Smartphones & Electronics
  else if (category.includes('smartphone') || category.includes('mobile-phone') || slug.includes('smartphone') || slug.includes('phone')) {
    primaryUrl = '/products/bd/canonical_smartphone.jpg';
    secondaryUrl = primaryUrl;
  }
  // 15. Apparel (Panjabi, Sarees)
  else if (slug.includes('panjabi') || name.includes('panjabi')) {
    primaryUrl = '/products/bd/canonical_panjabi_embroidered.jpg';
    secondaryUrl = primaryUrl;
  } else if (slug.includes('saree') || name.includes('saree') || slug.includes('kurti') || slug.includes('three-piece')) {
    primaryUrl = '/products/bd/canonical_saree_jamdani.jpg';
    secondaryUrl = primaryUrl;
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
      secondaryUrl = primaryUrl;
    }
  }

  return { primaryUrl, primaryAlt, secondaryUrl, secondaryAlt };
}
