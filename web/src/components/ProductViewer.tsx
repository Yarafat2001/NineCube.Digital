import { useEffect, useRef, useState } from 'react';
import type { Product } from '../api/types';
import { resolveAssetUrl } from '../api/client';
import { ProductImage } from './ProductImage';

const backdrops = [
  { name: 'Pearl', color: '#f4f5f7' },
  { name: 'Sand', color: '#eee4d5' },
  { name: 'Sage', color: '#dce5df' },
  { name: 'Slate', color: '#cbd4df' }
];

/** A photo viewer, not a fabricated 3D model: original image colours are preserved. */
export function ProductViewer({ product }: { product: Product }) {
  const gallery = product.images ?? [];
  const [index, setIndex] = useState(() => Math.max(0, gallery.findIndex(image => image.isPrimary)));
  const [depth, setDepth] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [backdrop, setBackdrop] = useState(backdrops[0]);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setIndex(Math.max(0, (product.images ?? []).findIndex(image => image.isPrimary)));
    setTilt({ x: 0, y: 0 }); setZoom(1);
  }, [product.id]);
  const selected = gallery[index];
  const changeAngle = (delta: number) => {
    setIndex(value => (value + delta + gallery.length) % gallery.length);
    setTilt({ x: 0, y: 0 }); setZoom(1);
  };
  return <section className="product-viewer" aria-label="Interactive product gallery">
    <div className="viewer-modes" role="group" aria-label="Product view mode">
      <button type="button" className="btn btn--sm" aria-pressed={!depth} onClick={() => { setDepth(false); setTilt({ x: 0, y: 0 }); }}>Photo</button>
      <button type="button" className="btn btn--sm" aria-pressed={depth} onClick={() => { setDepth(true); setTilt({ x: -6, y: 12 }); }}>3D photo</button>
      <span className="muted">{gallery.length > 1 ? `${index + 1} / ${gallery.length} angles` : 'Original photo'}</span>
    </div>
    <div className="product-viewer__stage" data-depth={depth} style={{ background: backdrop.color }}
      tabIndex={depth ? 0 : undefined} role="group" aria-label="Product photo. In 3D photo mode use arrow keys to tilt, or Home to reset."
      onKeyDown={event => {
        if (!depth || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
        event.preventDefault();
        setTilt(value => event.key === 'Home' ? { x: 0, y: 0 } : {
          x: Math.max(-12, Math.min(12, value.x + (event.key === 'ArrowUp' ? -4 : event.key === 'ArrowDown' ? 4 : 0))),
          y: Math.max(-24, Math.min(24, value.y + (event.key === 'ArrowLeft' ? -4 : event.key === 'ArrowRight' ? 4 : 0)))
        });
      }}
      onPointerDown={event => {
        pointer.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        if (!pointer.current || !depth) return;
        setTilt({ x: Math.max(-12, Math.min(12, (pointer.current.y - event.clientY) / 6)), y: Math.max(-24, Math.min(24, (event.clientX - pointer.current.x) / 5)) });
      }}
      onPointerUp={event => {
        if (pointer.current && !depth && gallery.length > 1 && Math.abs(event.clientX - pointer.current.x) > 45)
          changeAngle(event.clientX < pointer.current.x ? 1 : -1);
        pointer.current = null;
      }}
      onPointerCancel={() => { pointer.current = null; }}>
      <div className="product-viewer__photo" style={{ transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${zoom})` }}>
        <ProductImage product={product} images={selected ? [selected] : null} frame="detail" />
      </div>
    </div>
    <p className="muted viewer-hint">{depth ? 'Drag to tilt the photo. Select an angle below.' : gallery.length > 1 ? 'Swipe or select a photo to explore available angles.' : 'Zoom in to explore the original product photo.'}</p>
    <div className="viewer-controls" role="group" aria-label="Gallery controls">
      {gallery.length > 1 ? <><button type="button" className="btn btn--sm" onClick={() => changeAngle(-1)} aria-label="Previous product angle">Previous</button><button type="button" className="btn btn--sm" onClick={() => changeAngle(1)} aria-label="Next product angle">Next</button></> : null}
      <button type="button" className="btn btn--sm" disabled={zoom <= 1} aria-label="Zoom out" onClick={() => setZoom(value => Math.max(1, value - .2))}>−</button>
      <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
      <button type="button" className="btn btn--sm" disabled={zoom >= 1.8} aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.8, value + .2))}>+</button>
      <button type="button" className="btn btn--sm" onClick={() => { setZoom(1); setTilt({ x: 0, y: 0 }); }}>Reset view</button>
    </div>
    <div className="viewer-backdrops" role="group" aria-label="Photo backdrop colour">
      <span>Backdrop</span>
      {backdrops.map(option => <button type="button" key={option.name} aria-label={`${option.name} backdrop`} aria-pressed={backdrop.name === option.name}
        style={{ '--swatch': option.color } as React.CSSProperties} onClick={() => setBackdrop(option)}><span aria-hidden="true" />{option.name}{backdrop.name === option.name ? ' ✓' : ''}</button>)}
    </div>
    {gallery.length > 1 ? <div className="product-detail__thumbs" aria-label="Product images">
      {gallery.map((image, imageIndex) => <button type="button" key={image.id} aria-pressed={index === imageIndex}
        aria-label={`Show ${image.altText ?? `${product.name} angle ${imageIndex + 1}`}`} onClick={() => { setIndex(imageIndex); setZoom(1); setTilt({ x: 0, y: 0 }); }}>
        <img src={resolveAssetUrl(image.url)} alt="" loading="lazy" />
      </button>)}
    </div> : null}
  </section>;
}
