import { Facebook, Instagram, Twitter } from 'lucide-react';
import Link from 'next/link';


export function StorefrontFooter() {
  return (
    <footer className="bg-zinc-900 text-zinc-300 border-t-4 border-primary">
      <div className="container mx-auto px-4 py-16">
        <div className="grid gap-12 sm:grid-cols-2">
          <div>
            <h3 className="mb-4 text-2xl font-black text-white uppercase tracking-tighter font-display">
              Bay State Pet & Garden
            </h3>
            <p className="text-zinc-400 mb-6 border-l-2 border-accent pl-3 text-xs uppercase font-bold tracking-widest">
              From big to small, we feed them all!
            </p>
            <div className="flex space-x-4">
              <a
                href="https://www.facebook.com/baystatepet"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-primary transition-all duration-300"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com/BayStatePet"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-primary transition-all duration-300"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/baystatepet/"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-primary transition-all duration-300"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-white">
              Shop
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/products"
                  className="hover:text-accent transition-colors flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-accent/50 mr-2 inline-block"></span>
                  All Products
                </Link>
              </li>
              <li>
                <Link
                  href="/brands"
                  className="hover:text-accent transition-colors flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-accent/50 mr-2 inline-block"></span>
                  Brands
                </Link>
              </li>
            </ul>
          </div>




        </div>

        <div className="mt-16 border-t border-zinc-800 pt-8">
          <div className="grid gap-8 lg:grid-cols-2 items-center">
            <div className="bg-zinc-800/50 p-6 rounded-lg">
              <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">
                Contact & Hours
              </h4>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="text-sm">
                  <p className="font-semibold text-white mb-1">Address:</p>
                  <p className="text-zinc-400">429 Winthrop Street<br/>Taunton, MA 02780</p>
                  <div className="mt-3 flex flex-col gap-1">
                    <a href="mailto:sales@baystatepet.com" className="text-accent hover:underline underline-offset-4 font-medium w-fit">
                      sales@baystatepet.com
                    </a>
                    <a href="tel:+15088213704" className="text-accent hover:underline underline-offset-4 font-medium w-fit">
                      (508) 821-3704
                    </a>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-white mb-1">Store Hours:</p>
                  <p className="text-zinc-400">Mon - Fri: 8:00 am - 7:00 pm<br/>Sat: 8:00 am - 6:00 pm<br/>Sun: 8:00 am - 5:00 pm</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center lg:items-end">
              <div className="mb-6 flex flex-wrap justify-center gap-6 lg:justify-end">
                <Link href="/shipping" className="text-sm font-medium hover:text-white transition-colors">Shipping</Link>
                <Link href="/returns" className="text-sm font-medium hover:text-white transition-colors">Returns</Link>
                <Link href="/privacy" className="text-sm font-medium hover:text-white transition-colors">Privacy / Security</Link>
                <Link href="/contact" className="text-sm font-medium hover:text-white transition-colors">Career Opportunities</Link>
              </div>
              <p className="text-sm text-zinc-500 flex items-center gap-2">
                &copy; {new Date().getFullYear()} Bay State Pet & Garden Supply. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
