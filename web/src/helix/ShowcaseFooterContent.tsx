import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { showcaseCopy } from './showcaseCopy';

/** Shared closing content for the animated and static public home. */
export function ShowcaseFooterContent() {
  return <>
    <div className="showcase-footer__lead">
      <p className="kicker">Your next everyday favourite</p>
      <h2>{showcaseCopy.footer.headline}</h2>
      <p>{showcaseCopy.footer.body}</p>
      <Link className="btn btn--primary showcase__cta" to="/products">
        {showcaseCopy.footer.cta} <span aria-hidden="true">↗</span>
      </Link>
    </div>
    <div className="showcase-footer__base">
      <div className="showcase-footer__row">
        <Link to="/" className="showcase-footer__brand"><Brand /></Link>
        <nav aria-label="Home footer" className="showcase-footer__links">
          <Link to="/products">Collection</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
        </nav>
      </div>
      <div className="showcase-footer__legal">
        <p>© {new Date().getFullYear()} NineCube.Digital</p>
        <p>Built by Yeasin Arafat</p>
      </div>
    </div>
  </>;
}
