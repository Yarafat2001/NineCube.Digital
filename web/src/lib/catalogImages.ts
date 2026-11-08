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

  let primaryUrl = primaryFromGallery?.url ?? product.imageUrl ?? null;
  let secondaryUrl = secondaryFromGallery?.url ?? null;
  let primaryAlt = primaryFromGallery?.altText ?? product.name;
  let secondaryAlt = secondaryFromGallery?.altText ?? `${product.name} (Inside View)`;

  const slug = (product.slug || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const category = (product.categories?.[0]?.slug || '').toLowerCase();

  // 1. Chinigura & Rice Staples
  if (slug.includes('chinigura') || name.includes('chinigura') || category === 'rice') {
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
    secondaryAlt = `${product.name} (Pure Golden Mustard Oil in Bowl)`;
  }
  // 3. Olive Oil
  else if (slug.includes('olive-oil') || name.includes('olive oil')) {
    primaryUrl = '/products/bd/canonical_olive_oil_packet.jpg';
    secondaryUrl = '/products/bd/canonical_olive_oil_open.jpg';
    primaryAlt = `${product.name} (Bottle View)`;
    secondaryAlt = `${product.name} (Pure Extra Virgin Olive Oil & Whole Olives)`;
  }
  // 4. Anklet / Payel Jewelry
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
  // 5. Baby Winter Sets
  else if (slug.includes('baby-winter') || name.includes('baby winter') || (slug.includes('winter-set') && slug.includes('baby'))) {
    primaryUrl = '/products/bd/canonical_baby_winter_packet.jpg';
    secondaryUrl = '/products/bd/canonical_baby_winter_open.jpg';
    primaryAlt = `${product.name} (Packaging Box)`;
    secondaryAlt = `${product.name} (Complete Knit Sweater, Pants, Booties & Beanie Set)`;
  }
  // 6. 10 Minute School Courses
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
  // 7. Dairy & Yogurt
  else if (slug.includes('sweet-yogurt') || name.includes('sweet yogurt')) {
    primaryUrl = '/products/bd/canonical_aarong_sweet_yogurt_packet.jpg';
    secondaryUrl = '/products/bd/canonical_aarong_sweet_yogurt_open.jpg';
    primaryAlt = `${product.name} (Clay Pot Packaging)`;
    secondaryAlt = `${product.name} (Creamy Sweet Mishti Doi View)`;
  } else if (slug.includes('ghee') || name.includes('ghee')) {
    primaryUrl = '/products/bd/canonical_aarong_ghee_packet.jpg';
    secondaryUrl = '/products/bd/canonical_aarong_ghee_packet.jpg';
  } else if (slug.includes('turmeric') || name.includes('turmeric')) {
    primaryUrl = '/products/bd/canonical_radhuni_turmeric_packet.jpg';
    secondaryUrl = '/products/bd/canonical_turmeric_open.jpg';
    primaryAlt = `${product.name} (Retail Spice Pack)`;
    secondaryAlt = `${product.name} (Fresh Turmeric Roots & Pure Ground Powder)`;
  }

  // Fallback: if secondaryUrl is not yet set but primaryUrl exists and is a .jpg
  if (!secondaryUrl && primaryUrl) {
    if (primaryUrl.includes('_packet.jpg')) {
      secondaryUrl = primaryUrl.replace('_packet.jpg', '_open.jpg');
    } else if (primaryUrl.endsWith('.jpg') && !primaryUrl.includes('-open.jpg') && !primaryUrl.includes('_open.jpg')) {
      secondaryUrl = primaryUrl.replace(/\.jpg$/, '-open.jpg');
    }
  }

  return { primaryUrl, primaryAlt, secondaryUrl, secondaryAlt };
}
