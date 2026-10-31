import type { SVGProps } from 'react';
const paths = {
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  phone: 'M6 2h12v20H6zM10 18h4',
  shoe: 'M3 15c4 0 6-2 7-5l3 4 7 2c2 1 2 5 0 5H3v-6Zm0 3h18M11 12l-2 2M14 14l-2 2',
  chair: 'M5 3h14v10H5zM3 13h18v4H3zM5 17v5M19 17v5',
  fridge: 'M5 2h14v20H5zM5 9h14M8 5v2M8 12v4',
  coffee: 'M4 8h12v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm12 1h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10',
  chevron: 'm6 9 6 6 6-6', logout: 'M9 4H4v16h5M14 8l4 4-4 4M8 12h13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  hidden: 'm3 3 18 18M10 5a13 13 0 0 1 2 0c6 0 10 7 10 7a19 19 0 0 1-4 4M6 6a19 19 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1',
  check: 'm5 12 4 4L19 6', clock: 'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  truck: 'M1 4h13v13H1zM14 9h5l4 5v3h-9M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  wallet: 'M3 5h17v15H3zM3 5V3h15M16 11h6v5h-6z', spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  cart: 'M2 3h3l3 12h11l3-8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
};
export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>;
}
