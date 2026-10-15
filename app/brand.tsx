export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <a className="brand" href="/" aria-label="SANEXT — открыть опрос">
      <img
        className="brand-logo"
        src="/sanext_logo.svg"
        alt="SANEXT"
        width="154"
        height="33"
      />
      <span>{subtitle}</span>
    </a>
  );
}
