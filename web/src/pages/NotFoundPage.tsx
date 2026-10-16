import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page container">
      <div className="state">
        <p className="state__title">Page not found</p>
        <p>The page you asked for does not exist.</p>
        <Link className="btn btn--primary" to="/products">
          Back to the catalogue
        </Link>
      </div>
    </div>
  );
}
