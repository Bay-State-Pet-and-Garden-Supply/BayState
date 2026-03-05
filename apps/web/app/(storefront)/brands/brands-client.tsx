'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Brand } from '@/lib/types';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface BrandsClientProps {
  brands: Brand[];
}

export function BrandsClient({ brands }: BrandsClientProps) {
  const groupedBrands = brands.reduce((acc, brand) => {
    const firstLetter = brand.name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
    
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(brand);
    return acc;
  }, {} as Record<string, Brand[]>);

  const letters = Object.keys(groupedBrands).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const scrollToSection = (letter: string) => {
    const element = document.getElementById(`brand-section-${letter}`);
    if (element) {
      const offset = 120; 
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setActiveLetter(letter);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const letter = entry.target.id.replace('brand-section-', '');
            setActiveLetter(letter);
          }
        });
      },
      {
        rootMargin: '-120px 0px -80% 0px' 
      }
    );

    letters.forEach((letter) => {
      const element = document.getElementById(`brand-section-${letter}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [letters]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 relative">
      <aside className="lg:w-16 flex-shrink-0">
        <div className="sticky top-24 flex lg:flex-col flex-wrap gap-2 justify-center lg:justify-start bg-background/95 backdrop-blur py-4 lg:py-0 z-10 border-b lg:border-none">
          {letters.map((letter) => (
            <button
              key={letter}
              onClick={() => scrollToSection(letter)}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-zinc-100 hover:text-primary",
                activeLetter === letter 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" 
                  : "text-muted-foreground"
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 space-y-12">
        {letters.map((letter) => (
          <div key={letter} id={`brand-section-${letter}`} className="scroll-mt-24">
            <div className="flex items-center gap-4 mb-6 border-b pb-2">
              <h2 className="text-2xl font-bold text-primary">{letter}</h2>
              <span className="text-sm text-muted-foreground">
                {groupedBrands[letter].length} {groupedBrands[letter].length === 1 ? 'Brand' : 'Brands'}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {groupedBrands[letter].map((brand) => (
                <Link 
                  href={`/products?brand=${brand.slug}`} 
                  key={brand.id} 
                  className="group block h-full"
                >
                  <Card className="h-full hover:shadow-lg transition-all duration-[--animate-duration-slow] border-zinc-200 overflow-hidden group-hover:border-primary/50">
                    <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center gap-3">
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        {brand.logo_url ? (
                          <Image
                            src={brand.logo_url}
                            alt={brand.name}
                            fill
                            className="object-contain transition-transform duration-[--animate-duration-slower] group-hover:scale-105"
                            sizes="(max-width: 768px) 50vw, 25vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-100 rounded-full text-primary font-bold text-xl border-2 border-primary/10">
                            {brand.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2">
                          {brand.name}
                        </h3>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {brands.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No brands found.
          </div>
        )}
      </div>
    </div>
  );
}
