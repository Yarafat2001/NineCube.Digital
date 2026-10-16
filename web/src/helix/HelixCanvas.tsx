import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { showcaseCopy } from './showcaseCopy';
import { createHelixScene, type HelixSceneHandle } from './helixScene';
import './showcase.css';
import { ShowcaseHeroPhoto } from './ShowcaseHeroPhoto';
import { CategoryPreview } from './CategoryPreview';
import { HeroPromotions } from './HeroPromotions';
import { DEFAULT_CARD_ASSETS } from './cardAssets';
import { ShowcaseFooterContent } from './ShowcaseFooterContent';

export interface HelixCanvasProps {
  /** Exactly nine absolute image URLs, already resolved to `public/assets`. */
  cardAssets: readonly string[];
  /** Called when the scene cannot start at all, so the page can show the static grid instead. */
  onFailure?: (error: unknown) => void;
}

/**
 * Adapter around the reference scene.
 *
 * React owns the markup (the same structure and classes as the reference `index.html`, minus its
 * own nav bar), and the scene owns the canvas and the render loop. Mounting starts the animation;
 * unmounting releases everything - render loop, listeners, geometries, materials, textures,
 * renderer context and the canvas itself - so visiting the showcase repeatedly cannot leak.
 *
 * The markup order matters: the guide-line depth ordering and the sticky track depend on it.
 */
export default function HelixCanvas({ cardAssets, onFailure }: HelixCanvasProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const codexTitleRef = useRef<HTMLHeadingElement>(null);
  const threeTitleRef = useRef<HTMLHeadingElement>(null);
  const transitionShadeRef = useRef<HTMLDivElement>(null);
  const transitionTitleRef = useRef<HTMLDivElement>(null);
  const introTrackRef = useRef<HTMLElement>(null);
  const introStageRef = useRef<HTMLDivElement>(null);
  const introBlockRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLElement>(null);
  const outroBlockRef = useRef<HTMLDivElement>(null);

  // The callback lives in a ref so a caller that re-creates it does not restart the scene.
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;
    const track = trackRef.current;
    const bar = barRef.current;
    const codexTitle = codexTitleRef.current;
    const threeTitle = threeTitleRef.current;
    const transitionShade = transitionShadeRef.current;
    const transitionTitle = transitionTitleRef.current;
    const introTrack = introTrackRef.current;
    const introStage = introStageRef.current;
    const introBlock = introBlockRef.current;
    const outro = outroRef.current;
    const outroBlock = outroBlockRef.current;

    if (
      !canvasContainer ||
      !track ||
      !bar ||
      !codexTitle ||
      !threeTitle ||
      !transitionShade ||
      !transitionTitle ||
      !introTrack ||
      !introStage ||
      !introBlock ||
      !outro ||
      !outroBlock
    ) {
      return;
    }

    let handle: HelixSceneHandle | null = null;

    try {
      handle = createHelixScene(
        {
          canvasContainer,
          track,
          bar,
          codexTitle,
          threeTitle,
          transitionShade,
          transitionTitle,
          introTrack,
          introStage,
          introBlock,
          outro,
          outroBlock
        },
        cardAssets
      );
    } catch (error) {
      // A driver refusal or a lost context must not take the page down: the page swaps in the
      // static grid, and the catalogue stays one route away.
      console.error('The helix scene could not start; showing the static grid instead.', error);
      canvasContainer.replaceChildren();
      onFailureRef.current?.(error);
      return;
    }

    return () => handle?.dispose();
  }, [cardAssets]);

  return (
    <div className="showcase" data-testid="showcase">
      <section id="introTrack" className="intro-track" ref={introTrackRef}>
        <div id="introStage" className="intro-stage" ref={introStageRef}>
          <ShowcaseHeroPhoto src={cardAssets[0] ?? DEFAULT_CARD_ASSETS[0]} />
          <div id="introBlock" className="intro-block" ref={introBlockRef}>
            <div className="kicker">{showcaseCopy.kicker}</div>
            <h1>
              {showcaseCopy.brand.line1}
              <br />
              {showcaseCopy.brand.line2}
            </h1>
            <p>{showcaseCopy.intro}</p>
            <Link className="btn btn--primary showcase__hero-cta" to="/products">Explore the collection <span aria-hidden="true">↗</span></Link>
            <HeroPromotions />
          </div>
        </div>
      </section>

      <section id="track" className="track" ref={trackRef}>
        <div className="sticky">
          <div id="transitionShade" className="transition-shade" ref={transitionShadeRef} />
          <CategoryPreview cardAssets={cardAssets} />
          <div id="transitionTitle" className="transition-title" ref={transitionTitleRef}>
            <span className="showcase__section-label">Discover the collection</span>
            <h2>{showcaseCopy.transitionTitle}</h2>
            <p>Technology, style, self-care and the comforts of home.</p>
          </div>

          <div className="editorial">
            <h2 className="line1" ref={codexTitleRef}>
              {showcaseCopy.title1}
              <span className="plus-gap">+</span>
            </h2>
            <h2 className="line2" ref={threeTitleRef}>
              {showcaseCopy.title2}
            </h2>
          </div>
          <p className="showcase__stage-copy">Small details. More possibilities.<br />Explore a little of everything.</p>

          <div className="showcase__scene" ref={canvasContainerRef} />

          <div className="progress">
            <i id="bar" ref={barRef} />
          </div>
        </div>
      </section>

      <footer id="outro" className="outro" ref={outroRef} aria-label="NineCube home footer">
        <div id="outroBlock" className="outro-block" ref={outroBlockRef}>
          <ShowcaseFooterContent />
        </div>
      </footer>

      {/* The canvas is decorative and carries no text, so the scene is described here instead. */}
      <p className="visually-hidden">
        Nine product cards travel through a three-dimensional helix as the page scrolls, with two
        guide lines following the same path in the opposite direction.
      </p>
    </div>
  );
}
