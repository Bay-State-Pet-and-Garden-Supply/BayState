import Link from 'next/link';

export function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-6 focus:py-3 focus:bg-zinc-950 focus:text-white focus:rounded-none focus:border focus:border-white focus:shadow-[2px_2px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tight"
    >
      Skip to main content
    </Link>
  );
}
