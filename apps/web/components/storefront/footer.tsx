import { Facebook, Instagram, Twitter } from 'lucide-react';
import Link from 'next/link';
import { NewsletterSignup } from '@/components/storefront/newsletter-signup';

export function StorefrontFooter() {
  return (
    <footer className="border-t-2 border-brand-forest-green bg-[#0f1f14] text-zinc-300">
      <div className="container mx-auto px-4 py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">
              Bay State Pet & Garden
            </h3>
            <p className="mb-6 border-l-2 border-brand-gold pl-3 text-sm font-medium text-zinc-400">
              From big to small, we feed them all
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-white/30 hover:text-white"
                aria-label="Facebook"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-white/30 hover:text-white"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-colors hover:border-white/30 hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-semibold text-white">Shop</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/products" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  All products
                </Link>
              </li>
              <li>
                <Link href="/services" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/brands" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Brands
                </Link>
              </li>
              <li>
                <Link href="/account/favorites" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Favorites
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-semibold text-white">Services</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/services/propane-refill" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Propane refill
                </Link>
              </li>
              <li>
                <Link href="/services/equipment-rentals" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Equipment rentals
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-sm font-semibold text-white">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="space-y-1">
                <span className="font-medium text-white">Address</span>
                <p className="text-zinc-400">429 Winthrop Street<br />Taunton, MA 02780</p>
              </li>
              <li className="space-y-1">
                <span className="font-medium text-white">Hours</span>
                <p className="text-zinc-400">
                  Mon – Fri 8am – 7pm<br />
                  Sat 8am – 6pm<br />
                  Sun 8am – 5pm
                </p>
              </li>
              <li>
                <a href="mailto:sales@baystatepet.com" className="text-brand-gold transition-colors hover:text-white">
                  sales@baystatepet.com
                </a>
              </li>
              <li>
                <a href="tel:+15088213704" className="text-brand-gold transition-colors hover:text-white">
                  (508) 821-3704
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 border-t border-white/10 pt-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <NewsletterSignup source="footer" />
            </div>

            <div className="flex flex-col items-center gap-6 lg:items-end">
              <div className="flex flex-wrap justify-center gap-5 lg:justify-end">
                <Link href="/shipping" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Shipping
                </Link>
                <Link href="/returns" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Returns
                </Link>
                <Link href="/privacy" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Privacy
                </Link>
                <Link href="/contact" className="text-sm text-zinc-400 transition-colors hover:text-white">
                  Contact
                </Link>
              </div>
              <p className="text-sm text-zinc-500">
                &copy; {new Date().getFullYear()} Bay State Pet & Garden Supply. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
