'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Image as ImageIcon, 
  Star, 
  Clock, 
  Save, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Monitor, 
  Smartphone, 
  Eye, 
  Search, 
  X, 
  Check, 
  Loader2, 
  ChevronRight, 
  Grid, 
  Layout, 
  Sliders, 
  Sparkles, 
  Store
} from 'lucide-react';
import { updateHomepageSettingsAction, searchProductsAction } from './actions';
import type { HomepageSettings, HeroSlide, PromoGridSettings, MidBannerSettings, DepartmentSettings, BrandsSettings } from '@/lib/settings';
import type { Product } from '@/lib/types';
import { toast } from 'sonner';

interface HomepageTabProps {
  initialSettings: HomepageSettings;
  categories: any[];
  brands: any[];
  initialFeaturedProducts: Product[];
}

const DEFAULT_PROMO_GRID: PromoGridSettings = {
  leftBanner: {
    title: 'Winter Essentials',
    imageUrl: '/images/legacy/img1.png',
    linkUrl: '/c/lawn-garden-seasonal-outdoor-utility',
  },
  rightCard1: {
    title: 'Bee Nuc Pre-Order',
    imageUrl: '/images/legacy/img2.png',
    linkUrl: '/c/farm-animal',
  },
  rightCard2: {
    title: 'Wood Pellets Sale',
    imageUrl: '/images/legacy/img3.png',
    linkUrl: '/c/home',
  },
};

const DEFAULT_MID_BANNER: MidBannerSettings = {
  enabled: true,
  title: 'Country Gift Shop',
  imageUrl: '/images/legacy/img4.png',
  linkUrl: '/c/home',
};

const DEFAULT_DEPARTMENTS: DepartmentSettings = {
  enabled: true,
  title: 'Shop by department',
  items: [
    { id: 'dog', name: 'Pet Supplies', slug: 'dog' },
    { id: 'farm-animal', name: 'Farm & Livestock', slug: 'farm-animal' },
    { id: 'lawn-garden', name: 'Lawn & Garden', slug: 'lawn-garden' },
    { id: 'home', name: 'Home & Fuel', slug: 'home' },
    { id: 'lawn-garden-seasonal-outdoor-utility', name: 'Seasonal Shoppe', slug: 'lawn-garden-seasonal-outdoor-utility' },
  ],
};

const DEFAULT_BRANDS_SECTION: BrandsSettings = {
  enabled: true,
  title: 'Brands we carry',
  limit: 10,
};

export function HomepageTab({ 
  initialSettings, 
  categories = [], 
  brands = [], 
  initialFeaturedProducts = [] 
}: HomepageTabProps) {
  // Main settings states
  const [heroMode, setHeroMode] = useState<'carousel' | 'single' | 'hidden'>(initialSettings.heroMode || 'carousel');
  const [hero, setHero] = useState(initialSettings.hero);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(initialSettings.heroSlides || []);
  const [heroSlideInterval, setHeroSlideInterval] = useState((initialSettings.heroSlideInterval || 5000) / 1000);
  const [storeHours, setStoreHours] = useState(initialSettings.storeHours);
  const [featuredTitle, setFeaturedTitle] = useState(initialSettings.featuredTitle || 'Featured Products');
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>(initialFeaturedProducts || []);
  
  // Custom promo structures
  const [promoGrid, setPromoGrid] = useState<PromoGridSettings>(initialSettings.promoGrid || DEFAULT_PROMO_GRID);
  const [midBanner, setMidBanner] = useState<MidBannerSettings>(initialSettings.midBanner || DEFAULT_MID_BANNER);
  const [departments, setDepartments] = useState<DepartmentSettings>(initialSettings.departments || DEFAULT_DEPARTMENTS);
  const [brandsSection, setBrandsSection] = useState<BrandsSettings>(initialSettings.brandsSection || DEFAULT_BRANDS_SECTION);

  // Editor UX States
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activePreviewSlide, setActivePreviewSlide] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Search Autocomplete States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Refs for scrolling targeted settings
  const editorRefs = {
    hero: useRef<HTMLDivElement>(null),
    promos: useRef<HTMLDivElement>(null),
    departments: useRef<HTMLDivElement>(null),
    featured: useRef<HTMLDivElement>(null),
    brands: useRef<HTMLDivElement>(null),
    hours: useRef<HTMLDivElement>(null),
  };

  // Debounced search for products autocomplete
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const products = await searchProductsAction(searchQuery);
        setSearchResults(products);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Carousel slide timer for preview panel
  useEffect(() => {
    if (heroMode !== 'carousel' || heroSlides.length <= 1) return;
    const interval = setInterval(() => {
      setActivePreviewSlide((prev) => (prev + 1) % heroSlides.length);
    }, heroSlideInterval * 1000);
    return () => clearInterval(interval);
  }, [heroMode, heroSlides.length, heroSlideInterval]);

  const scrollToEditorSection = (section: keyof typeof editorRefs) => {
    setActiveSection(section);
    editorRefs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Flash selection border briefly
    const element = editorRefs[section].current;
    if (element) {
      element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 1000);
    }
  };

  // Slide CRUD Handlers
  const addSlide = () => {
    const newSlide: HeroSlide = {
      id: crypto.randomUUID(),
      title: 'New Promotional Slide',
      subtitle: 'Subheading or discount offer text',
      imageUrl: '/images/legacy/baby-chicks-are-here-s-ider.png',
      linkUrl: '/products',
      linkText: 'Shop Now',
    };
    setHeroSlides([...heroSlides, newSlide]);
  };

  const removeSlide = (id: string) => {
    setHeroSlides(heroSlides.filter(s => s.id !== id));
    if (activePreviewSlide >= Math.max(1, heroSlides.length - 1)) {
      setActivePreviewSlide(0);
    }
  };

  const updateSlide = (id: string, field: keyof HeroSlide, value: string) => {
    setHeroSlides(heroSlides.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= heroSlides.length) return;
    const updated = [...heroSlides];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setHeroSlides(updated);
  };

  // Featured Product Handlers
  const addFeaturedProduct = (product: Product) => {
    if (featuredProducts.some(p => p.id === product.id)) {
      toast.error('Product is already in the featured list');
      return;
    }
    setFeaturedProducts([...featuredProducts, product]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFeaturedProduct = (id: string) => {
    setFeaturedProducts(featuredProducts.filter(p => p.id !== id));
  };

  const moveFeaturedProduct = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= featuredProducts.length) return;
    const updated = [...featuredProducts];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setFeaturedProducts(updated);
  };

  // Department / Category Handlers
  const addDepartmentItem = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    if (departments.items.some(item => item.id === category.id || item.slug === category.slug)) {
      toast.error('Department is already displayed');
      return;
    }
    const newItem = {
      id: category.id,
      name: category.name,
      slug: category.slug
    };
    setDepartments({
      ...departments,
      items: [...departments.items, newItem]
    });
  };

  const removeDepartmentItem = (id: string) => {
    setDepartments({
      ...departments,
      items: departments.items.filter(item => item.id !== id)
    });
  };

  const moveDepartmentItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= departments.items.length) return;
    const updated = [...departments.items];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setDepartments({
      ...departments,
      items: updated
    });
  };

  // Form Submit Action
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData();
    formData.set('heroMode', heroMode);
    formData.set('featuredTitle', featuredTitle);
    formData.set('heroSlideInterval', String(heroSlideInterval * 1000));
    formData.set('storeHours', storeHours);

    // Save complex layout values as JSON strings
    formData.set('hero.title', hero.title);
    formData.set('hero.subtitle', hero.subtitle || '');
    formData.set('hero.imageUrl', hero.imageUrl || '');
    formData.set('hero.ctaText', hero.ctaText || '');
    formData.set('hero.ctaLink', hero.ctaLink || '');

    const productIds = featuredProducts.map(p => p.id);
    formData.set('featuredProductIds', JSON.stringify(productIds));
    formData.set('heroSlides', JSON.stringify(heroSlides));
    formData.set('promoGrid', JSON.stringify(promoGrid));
    formData.set('midBanner', JSON.stringify(midBanner));
    formData.set('departments', JSON.stringify(departments));
    formData.set('brandsSection', JSON.stringify(brandsSection));

    const result = await updateHomepageSettingsAction(formData);
    setIsSaving(false);

    if (result.success) {
      toast.success('Homepage settings updated successfully');
    } else {
      toast.error(result.error || 'Failed to save settings');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left panel: Editor Controls */}
      <form onSubmit={handleFormSubmit} className="space-y-6 lg:col-span-6 xl:col-span-5 h-[calc(100vh-12rem)] overflow-y-auto pr-2">
        
        {/* Editor Segment: Hero section */}
        <div ref={editorRefs.hero} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'hero' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-emerald-100 text-emerald-800 rounded-lg">
                <Layout className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Hero Section</h3>
                <p className="text-xs text-muted-foreground">Carousel slides or single banner</p>
              </div>
            </div>
            <select
              value={heroMode}
              onChange={(e) => setHeroMode(e.target.value as any)}
              className="text-xs border rounded px-2 py-1 bg-background font-medium"
            >
              <option value="carousel">Slideshow Carousel</option>
              <option value="single">Single Main Banner</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {heroMode === 'hidden' && (
            <div className="rounded-lg bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              The hero banner is hidden on the storefront page.
            </div>
          )}

          {heroMode === 'single' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hero.title" className="text-xs">Headline</Label>
                <Input
                  id="hero.title"
                  value={hero.title}
                  onChange={(e) => setHero({ ...hero, title: e.target.value })}
                  placeholder="Welcome to Bay State Pet & Garden"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hero.subtitle" className="text-xs">Subtitle</Label>
                <Input
                  id="hero.subtitle"
                  value={hero.subtitle || ''}
                  onChange={(e) => setHero({ ...hero, subtitle: e.target.value })}
                  placeholder="Your local source for pet supplies..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hero.imageUrl" className="text-xs">Background Image URL</Label>
                <Input
                  id="hero.imageUrl"
                  value={hero.imageUrl || ''}
                  onChange={(e) => setHero({ ...hero, imageUrl: e.target.value })}
                  placeholder="/images/hero-bg.jpg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="hero.ctaText" className="text-xs">CTA Button Text</Label>
                  <Input
                    id="hero.ctaText"
                    value={hero.ctaText || ''}
                    onChange={(e) => setHero({ ...hero, ctaText: e.target.value })}
                    placeholder="Shop Now"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hero.ctaLink" className="text-xs">CTA Button Link</Label>
                  <Input
                    id="hero.ctaLink"
                    value={hero.ctaLink || ''}
                    onChange={(e) => setHero({ ...hero, ctaLink: e.target.value })}
                    placeholder="/products"
                  />
                </div>
              </div>
            </div>
          )}

          {heroMode === 'carousel' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Auto-Cycle Interval (sec):</Label>
                  <Input
                    type="number"
                    min="2"
                    max="20"
                    value={heroSlideInterval}
                    onChange={(e) => setHeroSlideInterval(parseInt(e.target.value, 10) || 5)}
                    className="w-16 h-7 text-xs px-2"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSlide} className="h-7 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Slide
                </Button>
              </div>

              {heroSlides.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No promotional slides configured. Add a slide to build the carousel.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {heroSlides.map((slide, idx) => (
                    <div key={slide.id} className="border bg-background p-3 rounded-lg space-y-2 relative shadow-xs">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="text-xs font-semibold text-foreground">Slide {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === 0}
                            onClick={() => moveSlide(idx, 'up')}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === heroSlides.length - 1}
                            onClick={() => moveSlide(idx, 'down')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => removeSlide(slide.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Headline</Label>
                          <Input
                            value={slide.title}
                            onChange={(e) => updateSlide(slide.id, 'title', e.target.value)}
                            placeholder="Slide Title"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">Subheading</Label>
                          <Input
                            value={slide.subtitle || ''}
                            onChange={(e) => updateSlide(slide.id, 'subtitle', e.target.value)}
                            placeholder="Offer details"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Image URL</Label>
                        <Input
                          value={slide.imageUrl}
                          onChange={(e) => updateSlide(slide.id, 'imageUrl', e.target.value)}
                          placeholder="/images/hero.jpg"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">CTA Link</Label>
                          <Input
                            value={slide.linkUrl}
                            onChange={(e) => updateSlide(slide.id, 'linkUrl', e.target.value)}
                            placeholder="/c/lawn-garden"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground uppercase">CTA Text</Label>
                          <Input
                            value={slide.linkText || ''}
                            onChange={(e) => updateSlide(slide.id, 'linkText', e.target.value)}
                            placeholder="Shop Now"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Editor Segment: Promo Sections */}
        <div ref={editorRefs.promos} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'promos' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center gap-2 pb-2 border-b">
            <div className="flex h-8 w-8 items-center justify-center bg-rose-100 text-rose-800 rounded-lg">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Promo Banners</h3>
              <p className="text-xs text-muted-foreground">Grid and full-width promotional banners</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">3-Card Promo Grid</h4>
            
            {/* Left large banner */}
            <div className="border bg-background p-3 rounded-lg space-y-2">
              <span className="text-[10px] font-semibold text-primary uppercase">Left Column (Large Aspect)</span>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Banner Title</Label>
                    <Input
                      value={promoGrid.leftBanner.title}
                      onChange={(e) => setPromoGrid({
                        ...promoGrid,
                        leftBanner: { ...promoGrid.leftBanner, title: e.target.value }
                      })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Link Destination</Label>
                    <Input
                      value={promoGrid.leftBanner.linkUrl}
                      onChange={(e) => setPromoGrid({
                        ...promoGrid,
                        leftBanner: { ...promoGrid.leftBanner, linkUrl: e.target.value }
                      })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Image URL</Label>
                  <Input
                    value={promoGrid.leftBanner.imageUrl}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      leftBanner: { ...promoGrid.leftBanner, imageUrl: e.target.value }
                    })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Right stacked cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border bg-background p-3 rounded-lg space-y-2">
                <span className="text-[10px] font-semibold text-primary uppercase">Right Card 1 (Top)</span>
                <div className="space-y-1">
                  <Input
                    placeholder="Title"
                    value={promoGrid.rightCard1.title}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard1: { ...promoGrid.rightCard1, title: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder="Link"
                    value={promoGrid.rightCard1.linkUrl}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard1: { ...promoGrid.rightCard1, linkUrl: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder="Image URL"
                    value={promoGrid.rightCard1.imageUrl}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard1: { ...promoGrid.rightCard1, imageUrl: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              <div className="border bg-background p-3 rounded-lg space-y-2">
                <span className="text-[10px] font-semibold text-primary uppercase">Right Card 2 (Bottom)</span>
                <div className="space-y-1">
                  <Input
                    placeholder="Title"
                    value={promoGrid.rightCard2.title}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard2: { ...promoGrid.rightCard2, title: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder="Link"
                    value={promoGrid.rightCard2.linkUrl}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard2: { ...promoGrid.rightCard2, linkUrl: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder="Image URL"
                    value={promoGrid.rightCard2.imageUrl}
                    onChange={(e) => setPromoGrid({
                      ...promoGrid,
                      rightCard2: { ...promoGrid.rightCard2, imageUrl: e.target.value }
                    })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between pb-2">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Full-Width Mid Banner</h4>
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="midBannerEnabled"
                    checked={midBanner.enabled}
                    onChange={(e) => setMidBanner({ ...midBanner, enabled: e.target.checked })}
                    className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <Label htmlFor="midBannerEnabled" className="text-xs font-medium cursor-pointer">Show banner</Label>
                </div>
              </div>

              {midBanner.enabled && (
                <div className="space-y-2 bg-background border p-3 rounded-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase">Overlay Headline</Label>
                      <Input
                        value={midBanner.title}
                        onChange={(e) => setMidBanner({ ...midBanner, title: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase">Link Url</Label>
                      <Input
                        value={midBanner.linkUrl}
                        onChange={(e) => setMidBanner({ ...midBanner, linkUrl: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Background Image URL</Label>
                    <Input
                      value={midBanner.imageUrl}
                      onChange={(e) => setMidBanner({ ...midBanner, imageUrl: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Editor Segment: Shop by Department */}
        <div ref={editorRefs.departments} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'departments' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-blue-100 text-blue-800 rounded-lg">
                <Grid className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Shop by Department</h3>
                <p className="text-xs text-muted-foreground">Select and arrange shown categories</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="deptEnabled"
                checked={departments.enabled}
                onChange={(e) => setDepartments({ ...departments, enabled: e.target.checked })}
                className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <Label htmlFor="deptEnabled" className="text-xs font-semibold cursor-pointer">Visible</Label>
            </div>
          </div>

          {departments.enabled && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="deptTitle" className="text-xs">Section Headline</Label>
                <Input
                  id="deptTitle"
                  value={departments.title}
                  onChange={(e) => setDepartments({ ...departments, title: e.target.value })}
                  placeholder="Shop by department"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addDepartmentItem(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="text-xs border rounded-lg px-2 py-1.5 bg-background flex-1 h-8 font-medium"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Add category department --</option>
                    {categories
                      .filter(cat => !departments.items.some(item => item.id === cat.id))
                      .map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="space-y-1 bg-background border rounded-lg p-2 max-h-56 overflow-y-auto">
                  {departments.items.length === 0 ? (
                    <p className="text-center text-[10px] text-muted-foreground py-4">No departments selected. Homepage will show defaults.</p>
                  ) : (
                    departments.items.map((item, idx) => (
                      <div key={item.id} className="flex items-center justify-between border-b last:border-0 py-1.5 px-2 text-xs">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === 0}
                            onClick={() => moveDepartmentItem(idx, 'up')}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === departments.items.length - 1}
                            onClick={() => moveDepartmentItem(idx, 'down')}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => removeDepartmentItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editor Segment: Featured Products */}
        <div ref={editorRefs.featured} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'featured' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center gap-2 pb-2 border-b">
            <div className="flex h-8 w-8 items-center justify-center bg-amber-100 text-amber-800 rounded-lg">
              <Star className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Featured Products</h3>
              <p className="text-xs text-muted-foreground">Select and order products highlighted on homepage</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="featuredTitle" className="text-xs">Section Headline</Label>
              <Input
                id="featuredTitle"
                value={featuredTitle}
                onChange={(e) => setFeaturedTitle(e.target.value)}
                placeholder="Featured products"
                className="h-8 text-xs"
              />
            </div>

            {/* Product Autocomplete Search */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs">Add Product</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search products by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isSearching && (
                <div className="absolute z-10 w-full bg-popover border rounded-md shadow-md p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching products...
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="absolute z-10 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1 divide-y">
                  {searchResults.map(prod => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => addFeaturedProduct(prod)}
                      className="w-full text-left p-2 hover:bg-muted text-xs flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        {prod.images && prod.images.length > 0 ? (
                          <img src={prod.images[0]} className="h-7 w-7 object-cover rounded bg-muted" alt="" />
                        ) : (
                          <div className="h-7 w-7 bg-muted rounded flex items-center justify-center text-[8px]">No img</div>
                        )}
                        <div>
                          <span className="font-semibold text-foreground">{prod.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{prod.brand?.name || 'Store brand'} • SKU: {prod.sku || prod.id.slice(0, 8)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Add</span>
                    </button>
                  ))}
                </div>
              )}

              {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <div className="absolute z-10 w-full bg-popover border rounded-md shadow-md p-3 text-center text-xs text-muted-foreground">
                  No products found.
                </div>
              )}
            </div>

            {/* List of Selected Products */}
            <div className="space-y-1">
              <Label className="text-xs">Selected Products ({featuredProducts.length})</Label>
              <div className="border bg-background rounded-lg divide-y max-h-72 overflow-y-auto">
                {featuredProducts.length === 0 ? (
                  <p className="text-center text-[10px] text-muted-foreground py-6">No products selected. Storefront will show automatically featured items.</p>
                ) : (
                  featuredProducts.map((prod, idx) => (
                    <div key={prod.id} className="flex items-center justify-between p-2 text-xs group">
                      <div className="flex items-center gap-2 min-w-0">
                        {prod.images && prod.images.length > 0 ? (
                          <img src={prod.images[0]} className="h-8 w-8 object-cover rounded bg-muted flex-shrink-0" alt="" />
                        ) : (
                          <div className="h-8 w-8 bg-muted rounded flex items-center justify-center text-[8px] flex-shrink-0">No img</div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-foreground block truncate">{prod.name}</span>
                          <span className="text-[10px] text-muted-foreground block">${prod.price.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === 0}
                          onClick={() => moveFeaturedProduct(idx, 'up')}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === featuredProducts.length - 1}
                          onClick={() => moveFeaturedProduct(idx, 'down')}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => removeFeaturedProduct(prod.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Editor Segment: Brands Carousel */}
        <div ref={editorRefs.brands} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'brands' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-indigo-100 text-indigo-800 rounded-lg">
                <Sliders className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Brands Section</h3>
                <p className="text-xs text-muted-foreground">Carousel parameters for brands we carry</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="brandsEnabled"
                checked={brandsSection.enabled}
                onChange={(e) => setBrandsSection({ ...brandsSection, enabled: e.target.checked })}
                className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <Label htmlFor="brandsEnabled" className="text-xs font-semibold cursor-pointer">Visible</Label>
            </div>
          </div>

          {brandsSection.enabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="brandsTitle" className="text-xs">Section Headline</Label>
                  <Input
                    id="brandsTitle"
                    value={brandsSection.title}
                    onChange={(e) => setBrandsSection({ ...brandsSection, title: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Brands Displayed</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="4"
                      max="20"
                      step="1"
                      value={brandsSection.limit}
                      onChange={(e) => setBrandsSection({ ...brandsSection, limit: parseInt(e.target.value, 10) })}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded">{brandsSection.limit}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editor Segment: Store Hours */}
        <div ref={editorRefs.hours} className={`transition-all duration-300 border border-border bg-card p-6 rounded-xl space-y-4 shadow-sm ${activeSection === 'hours' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
          <div className="flex items-center gap-2 pb-2 border-b">
            <div className="flex h-8 w-8 items-center justify-center bg-purple-100 text-purple-800 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Store Hours</h3>
              <p className="text-xs text-muted-foreground">Operational hours displayed in page footer</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="storeHoursText" className="text-xs">Hours Text</Label>
            <Textarea
              id="storeHoursText"
              value={storeHours}
              onChange={(e) => setStoreHours(e.target.value)}
              placeholder="Mon-Fri: 9am - 6pm..."
              rows={4}
              className="text-xs font-mono"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 flex justify-end gap-3 z-10">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              // Reset state back to database properties
              setHeroMode(initialSettings.heroMode || 'carousel');
              setHero(initialSettings.hero);
              setHeroSlides(initialSettings.heroSlides || []);
              setHeroSlideInterval((initialSettings.heroSlideInterval || 5000) / 1000);
              setStoreHours(initialSettings.storeHours);
              setFeaturedTitle(initialSettings.featuredTitle || 'Featured Products');
              setFeaturedProducts(initialFeaturedProducts || []);
              setPromoGrid(initialSettings.promoGrid || DEFAULT_PROMO_GRID);
              setMidBanner(initialSettings.midBanner || DEFAULT_MID_BANNER);
              setDepartments(initialSettings.departments || DEFAULT_DEPARTMENTS);
              setBrandsSection(initialSettings.brandsSection || DEFAULT_BRANDS_SECTION);
              toast.info('Settings reset to saved state');
            }}
            disabled={isSaving}
          >
            Reset Draft
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Save Homepage Settings
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Right panel: Live Preview Mockup */}
      <div className="lg:col-span-6 xl:col-span-7 flex flex-col h-[calc(100vh-12rem)] relative bg-muted/20 border rounded-xl overflow-hidden shadow-inner">
        {/* Preview Control Bar */}
        <div className="flex items-center justify-between p-3 border-b bg-background z-10 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-primary" /> Live Storefront Preview
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full border border-amber-200">Draft mode</span>
          </div>

          <div className="flex items-center border rounded-lg p-0.5 bg-muted/50 gap-0.5">
            <Button
              type="button"
              variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => setPreviewMode('desktop')}
              title="Desktop viewport"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => setPreviewMode('mobile')}
              title="Mobile viewport"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Storefront Frame Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100/60 dark:bg-zinc-950/20">
          <div className={`transition-all duration-300 w-full bg-[#fdfbf7] shadow-lg border border-border text-foreground flex flex-col font-sans relative ${previewMode === 'mobile' ? 'max-w-md min-h-[700px]' : 'w-full'}`}>
            
            {/* Mock Header */}
            <div className="bg-[#1b4332] text-white p-3.5 flex items-center justify-between border-b-2 border-emerald-950/20">
              <span className="font-serif font-bold text-base md:text-lg flex items-center gap-1.5"><Store className="h-4 w-4 text-emerald-400" /> Tiny Sprouts</span>
              <div className="hidden sm:flex gap-4 text-xs font-medium text-emerald-100/80">
                <span>Products</span>
                <span>Brands</span>
                <span>About</span>
              </div>
              <div className="text-[10px] border border-emerald-700/60 text-emerald-300 font-mono px-2 py-0.5 rounded bg-emerald-950/40">Mock Header</div>
            </div>

            {/* Mock Announcement */}
            <div className="bg-[#a7c957] text-[#1b4332] text-center py-1.5 text-[10px] font-semibold tracking-wider uppercase border-b border-emerald-900/10">
              Under Construction • Full site coming soon
            </div>

            {/* Mock Preview Content */}
            <div className="flex-1 divide-y divide-border">

              {/* 1. Hero Block Preview */}
              <div 
                onClick={() => scrollToEditorSection('hero')}
                className={`cursor-pointer transition-all p-3 hover:bg-emerald-500/5 group relative min-h-40 md:min-h-56 flex flex-col justify-center items-center text-center bg-cover bg-center bg-no-repeat ${heroMode === 'hidden' ? 'bg-zinc-200/40 py-8 min-h-0' : 'bg-emerald-800/10'}`}
                style={
                  heroMode === 'single' && hero.imageUrl
                    ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${hero.imageUrl})` }
                    : heroMode === 'carousel' && heroSlides[activePreviewSlide]?.imageUrl
                    ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${heroSlides[activePreviewSlide].imageUrl})` }
                    : undefined
                }
              >
                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Hero</div>

                {heroMode === 'hidden' && (
                  <span className="text-xs text-muted-foreground italic flex items-center gap-1.5">Hero section is hidden</span>
                )}

                {heroMode === 'single' && (
                  <div className="max-w-md p-4 text-white">
                    <h2 className="text-xl md:text-2xl font-bold font-serif leading-tight">{hero.title || 'Headline'}</h2>
                    {hero.subtitle && <p className="text-xs mt-1 text-emerald-100/90 line-clamp-2">{hero.subtitle}</p>}
                    {hero.ctaText && (
                      <span className="inline-block mt-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-wider shadow">
                        {hero.ctaText}
                      </span>
                    )}
                  </div>
                )}

                {heroMode === 'carousel' && (
                  <>
                    {heroSlides.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No slides configured. Add slides in editor.</span>
                    ) : (
                      <div className="max-w-md p-4 text-white flex flex-col items-center">
                        <h2 className="text-xl md:text-2xl font-bold font-serif leading-tight">{heroSlides[activePreviewSlide].title}</h2>
                        {heroSlides[activePreviewSlide].subtitle && (
                          <p className="text-xs mt-1 text-emerald-100/95 line-clamp-2">{heroSlides[activePreviewSlide].subtitle}</p>
                        )}
                        {heroSlides[activePreviewSlide].linkText && (
                          <span className="inline-block mt-3 bg-emerald-600 text-white font-semibold text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                            {heroSlides[activePreviewSlide].linkText}
                          </span>
                        )}
                        {/* Dot indicators */}
                        {heroSlides.length > 1 && (
                          <div className="flex gap-1.5 mt-4">
                            {heroSlides.map((_, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePreviewSlide(idx);
                                }}
                                className={`h-1.5 w-1.5 rounded-full ${activePreviewSlide === idx ? 'bg-white scale-125' : 'bg-white/40'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 2. Promo Grid Preview */}
              <div 
                onClick={() => scrollToEditorSection('promos')}
                className="p-4 cursor-pointer hover:bg-rose-500/5 group relative space-y-4"
              >
                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Promos</div>
                
                {/* 3-card grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Left big card */}
                  <div className="relative aspect-[627/376] overflow-hidden rounded-xl border bg-cover bg-center flex flex-col justify-end p-4 text-white min-h-36"
                    style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(${promoGrid.leftBanner.imageUrl || '/images/legacy/img1.png'})` }}
                  >
                    <h5 className="font-bold font-serif text-sm leading-tight">{promoGrid.leftBanner.title || 'Winter Essentials'}</h5>
                  </div>
                  {/* Right column stacked */}
                  <div className="flex flex-col gap-3 justify-between">
                    <div className="relative aspect-[627/174] overflow-hidden rounded-xl border bg-cover bg-center flex items-center justify-end p-3 min-h-16"
                      style={{ backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0.45)), url(${promoGrid.rightCard1.imageUrl || '/images/legacy/img2.png'})` }}
                    >
                      <span className="bg-white/95 text-foreground font-semibold text-[9px] px-2.5 py-1 rounded shadow-xs">{promoGrid.rightCard1.title || 'Bee Nuc Pre-Order'}</span>
                    </div>

                    <div className="relative aspect-[627/174] overflow-hidden rounded-xl border bg-cover bg-center flex items-center justify-end p-3 min-h-16"
                      style={{ backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0.45)), url(${promoGrid.rightCard2.imageUrl || '/images/legacy/img3.png'})` }}
                    >
                      <span className="bg-white/95 text-foreground font-semibold text-[9px] px-2.5 py-1 rounded shadow-xs">{promoGrid.rightCard2.title || 'Wood Pellets Sale'}</span>
                    </div>
                  </div>
                </div>

                {/* Mid page promo */}
                {midBanner.enabled && (
                  <div className="relative overflow-hidden rounded-xl border bg-cover bg-center h-20 md:h-24 flex items-center justify-center text-white"
                    style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url(${midBanner.imageUrl || '/images/legacy/img4.png'})` }}
                  >
                    <h4 className="text-base md:text-xl font-bold font-serif drop-shadow-xs">{midBanner.title || 'Country Gift Shop'}</h4>
                  </div>
                )}
              </div>

              {/* 3. Shop by Department Preview */}
              {departments.enabled && (
                <div 
                  onClick={() => scrollToEditorSection('departments')}
                  className="p-4 cursor-pointer hover:bg-blue-500/5 group relative space-y-3"
                >
                  <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Departments</div>
                  
                  <h4 className="text-xs font-bold text-foreground border-b pb-1 flex items-center gap-1"><Grid className="h-3 w-3 text-blue-600" /> {departments.title || 'Shop by department'}</h4>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {departments.items.length === 0 ? (
                      <div className="col-span-3 text-center py-6 text-[10px] text-muted-foreground italic">No departments selected. Default fallback items will display.</div>
                    ) : (
                      departments.items.map(item => (
                        <div key={item.id} className="border bg-gradient-to-b from-white to-emerald-500/[0.02] p-3 text-center rounded-lg shadow-2xs hover:border-emerald-600/30">
                          <span className="font-serif font-bold text-[11px] leading-tight text-foreground">{item.name}</span>
                          <span className="block text-[8px] text-muted-foreground mt-1 tracking-wider uppercase">Explore &rarr;</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. Featured Products Preview */}
              <div 
                onClick={() => scrollToEditorSection('featured')}
                className="p-4 cursor-pointer hover:bg-amber-500/5 group relative space-y-3"
              >
                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Featured</div>
                
                <h4 className="text-xs font-bold text-foreground border-b pb-1 flex items-center gap-1"><Star className="h-3 w-3 text-amber-600" /> {featuredTitle || 'Featured products'}</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {featuredProducts.length === 0 ? (
                    <div className="col-span-full text-center py-6 text-[10px] text-muted-foreground italic">No products featured. Storefront will auto-populate featured catalog items.</div>
                  ) : (
                    featuredProducts.slice(0, 6).map(prod => (
                      <div key={prod.id} className="border bg-white rounded-lg p-1.5 flex flex-col justify-between shadow-2xs">
                        <div className="space-y-1">
                          {prod.images && prod.images.length > 0 ? (
                            <img src={prod.images[0]} className="h-16 w-full object-cover rounded bg-muted" alt="" />
                          ) : (
                            <div className="h-16 w-full bg-muted rounded flex items-center justify-center text-[7px]">No image</div>
                          )}
                          <span className="block text-[9px] font-bold text-foreground leading-tight truncate">{prod.name}</span>
                          {prod.brand?.name && (
                            <span className="block text-[7px] text-muted-foreground truncate uppercase tracking-wider">{prod.brand.name}</span>
                          )}
                        </div>
                        <span className="block text-[9px] font-semibold text-emerald-800 mt-1.5">${prod.price.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 5. Brands Section Preview */}
              {brandsSection.enabled && (
                <div 
                  onClick={() => scrollToEditorSection('brands')}
                  className="p-4 cursor-pointer hover:bg-indigo-500/5 group relative space-y-3"
                >
                  <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Brands</div>
                  
                  <h4 className="text-xs font-bold text-foreground border-b pb-1 flex items-center justify-between">
                    <span>{brandsSection.title || 'Brands we carry'}</span>
                    <span className="text-[9px] text-primary">View all &rarr;</span>
                  </h4>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {brands.slice(0, Math.min(brandsSection.limit, 10)).map(br => (
                      <div key={br.id} className="border bg-white p-2 rounded-lg flex items-center justify-center h-10 shadow-3xs">
                        {br.logo_url ? (
                          <img src={br.logo_url} className="max-h-7 object-contain max-w-full" alt="" />
                        ) : (
                          <span className="text-[7px] font-bold text-muted-foreground truncate">{br.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. Footer Store Hours Preview */}
              <div 
                onClick={() => scrollToEditorSection('hours')}
                className="p-4 cursor-pointer hover:bg-purple-500/5 group relative bg-zinc-50 border-t"
              >
                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[8px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow">Click to Edit Hours</div>
                <div className="max-w-xs mx-auto text-center space-y-1.5">
                  <span className="text-[9px] font-bold text-foreground uppercase tracking-widest flex items-center justify-center gap-1"><Clock className="h-3 w-3 text-purple-600" /> Store Hours</span>
                  <p className="text-[9px] text-muted-foreground whitespace-pre-line leading-relaxed font-mono">{storeHours}</p>
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
