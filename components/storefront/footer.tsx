import { Facebook, Instagram, Twitter } from 'lucide-react';
import Link from 'next/link';
import { NewsletterSignup } from '@/components/storefront/newsletter-signup';

export function StorefrontFooter() {
  return (
    <footer className="border-t bg-zinc-50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">
              Bay State Pet & Garden
            </h3>
            <p className="text-sm text-zinc-700 mb-6">
              From big to small, we feed them all!
            </p>
            <div className="flex space-x-4">
                <a
                  href="https://www.facebook.com/baystatepet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-700 hover:text-zinc-700"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 hover:text-zinc-700"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 hover:text-zinc-700"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

            <div>
<h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-700">
                Shop
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/products"
                  className="text-sm text-zinc-700 hover:text-zinc-900"
                >
                  All Products
                </Link>
              </li>
              <li>
                <Link
                  href="/services"
                  className="text-sm text-zinc-700 hover:text-zinc-900"
                >
                  Services
                </Link>
              </li>
              <li>
                <Link
                  href="/brands"
                  className="text-sm text-zinc-700 hover:text-zinc-900"
                >
                  Brands
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-700">
              Services
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/services/propane"
                  className="text-sm text-zinc-700 hover:text-zinc-900"
                >
                  Propane Refill
                </Link>
              </li>
              <li>
                <Link
                  href="/services/rentals"
                  className="text-sm text-zinc-700 hover:text-zinc-900"
                >
                  Equipment Rentals
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-700">
              Contact
            </h4>
            <ul className="space-y-3 text-sm text-zinc-700">
              <li>429 Winthrop Street</li>
              <li>Taunton, MA 02780</li>
              <li>
                <a href="mailto:sales@baystatepet.com" className="hover:text-zinc-900">
                  sales@baystatepet.com
                </a>
              </li>
              <li>
                <a href="tel:+15088213704" className="hover:text-zinc-900">
                  (508) 821-3704
                </a>
              </li>
              <li>
                <a href="tel:+17742269845" className="hover:text-zinc-900">
                  (774) 226-9845
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t pt-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <NewsletterSignup source="footer" />
            
            <div className="flex flex-col items-center justify-center lg:items-end">
              <div className="mb-4 flex flex-wrap justify-center gap-4 lg:justify-end">
                <Link href="/shipping" className="text-sm text-zinc-700 hover:text-zinc-900">Shipping</Link>
                <Link href="/returns" className="text-sm text-zinc-700 hover:text-zinc-900">Returns</Link>
                <Link href="/privacy" className="text-sm text-zinc-700 hover:text-zinc-900">Privacy / Security</Link>
                <Link href="/careers" className="text-sm text-zinc-700 hover:text-zinc-900">Career Opportunities</Link>
              </div>
              <p className="text-sm text-zinc-700">
                © {new Date().getFullYear()} Bay State Pet & Garden Supply. All
                rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
