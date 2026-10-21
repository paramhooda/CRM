export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M9 22V10h7.2a4.4 4.4 0 0 1 0 8.8H13" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.5" cy="22" r="2" fill="var(--s3)" />
    </svg>
  );
}
