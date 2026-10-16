/** The supplied cube geometry, paired with a readable, theme-aware wordmark. */
export function Brand({ className = '' }: { className?: string }) {
  return (
    <span className={`brand ${className}`} role="img" aria-label="NineCube.Digital">
      <svg className="brand__mark" viewBox="62 10 45 51" aria-hidden="true" focusable="false">
        <path fill="var(--brand-strong)" fillRule="evenodd" d="M65 24.2 85 12 105 24 104.4 48 97.2 52.2 96.1 31 84.2 36 65 24.2Z M76.2 24.2 85 19 93.2 23.6 84.2 29Z" />
        <path className="brand__face" d="M64.2 25.5 83 35.2 83 58.6 64.2 47.5Z M84.3 36.3 96 31 96.2 51 84.3 58.7Z" />
      </svg>
      <span className="brand__wordmark" aria-hidden="true">
        <span><span className="brand__accent">Nine</span>Cube</span>
        <span className="brand__digital">DIGITAL</span>
      </span>
    </span>
  );
}
