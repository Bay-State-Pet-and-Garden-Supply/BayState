# Bay State Pet & Garden Supply

A high-performance, mobile-first PWA e-commerce platform for a local pet and garden supply store. Built with Next.js (App Router), TypeScript, and Supabase.

## 🌟 Features

### Customer Storefront
- **Intelligent Search** - Fuzzy search across 300+ products and services
- **Bento-Grid Layout** - Modern, visual product browsing
- **Mobile-First Design** - 44px+ touch targets, sticky cart
- **PWA Support** - Installable on mobile devices

### Admin Portal
- **Product Management** - Add/edit products with images
- **Brand Management** - CRUD for brands with logos
- **Service Management** - Manage propane refills, knife sharpening, etc.
- **Order Management** - Track and fulfill customer orders
- **Campaign Controls** - Toggle seasonal banners and promotions
- **ETL Pipeline** - Multi-stage product ingestion with web scraping enrichment
- **Enrichment Workspace** - Resolve data conflicts and manage "Golden Records"
- **Audit Trail** - Full history of pipeline status changes and deletions


### Technical Highlights
- **SEO Optimized** - Meta tags, Open Graph, sitemap, robots.txt
- **Structured Data** - JSON-LD for local business rich snippets
- **Type-Safe** - Strict TypeScript throughout
- **Tested** - 144+ unit tests with Jest

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase account (for database)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the storefront.

### Authentication Setup (Required for OAuth)

For Google/OAuth login to work locally, you must configure Supabase to allow localhost redirects:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   http://localhost:3000/**
   ```
3. Ensure your `.env.local` has:
   ```bash
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

Without this, OAuth callbacks will redirect to production instead of your local dev server.

### Admin Access
Navigate to [http://localhost:3000/admin](http://localhost:3000/admin) for the manager portal.

## 📁 Project Structure

```
app/
├── (storefront)/     # Customer-facing pages
│   ├── about/        # About page
│   ├── contact/      # Contact page
│   ├── products/     # Product browsing
│   └── services/     # Services listing
├── admin/            # Manager portal
│   ├── brands/       # Brand management
│   ├── products/     # Product management
│   ├── services/     # Service management
│   └── orders/       # Order management
├── manifest.ts       # PWA manifest
├── sitemap.ts        # Dynamic sitemap
└── robots.ts         # SEO robots config

components/
├── storefront/       # Customer UI components
├── admin/            # Admin UI components
└── ui/               # shadcn/ui base components

lib/
├── supabase/         # Database client utilities
├── data.ts           # Data fetching functions
├── brands.ts         # Brand CRUD operations
└── products.ts       # Product operations

conductor/            # Development workflow documentation
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in CI mode (single execution)
CI=true npm test

# Run specific test file
npm test -- --testPathPatterns="brands"
```

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (Strict) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Icons | Lucide React |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Testing | Jest + React Testing Library |

## 📄 License

Private - Bay State Pet & Garden Supply
