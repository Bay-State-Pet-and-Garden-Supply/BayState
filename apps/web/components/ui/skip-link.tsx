import Link from 'next/link';

export function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:border focus:border-zinc-200 focus:bg-white focus:px-6 focus:py-3 focus:text-zinc-950 focus:shadow-[var(--shadow-md)]"
    >
      Skip to main content
    </Link>
  );
}
