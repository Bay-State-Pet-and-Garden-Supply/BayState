import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDirectory, "..", "..");

const nextConfig: NextConfig = {
  transpilePackages: ['@baystate/api'],

  // Enable strict React mode for better development experience
  reactStrictMode: true,
  // Expose these specific variables to the client side without NEXT_PUBLIC_ prefix
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: 
      process.env.SUPABASE_PUBLISHABLE_KEY || 
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
      process.env.SUPABASE_ANON_KEY || 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // Remove X-Powered-By header for security
  poweredByHeader: false,

  // Enable compiler optimizations
  compiler: {
    // Remove console.log in production for smaller bundle
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Image optimization configuration
  images: {
    // Allow AVIF and WebP for better compression
    formats: ["image/avif", "image/webp"],
    // Device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // Image sizes for srcset
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache optimized images for a day to avoid repeated transforms on stable assets.
    minimumCacheTTL: 86400,
    // Disable SVG upload for security (use only if needed)
    dangerouslyAllowSVG: false,
    // Content disposition for security
    contentDispositionType: "attachment",
    // Content security policy for images
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Remote patterns for allowed external images
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // Limit generated variants to specific quality levels
    qualities: [50, 75],
  },

  // Optimize package imports for smaller bundle
  experimental: {
    optimizePackageImports: [
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "lucide-react",
      "date-fns",
      "embla-carousel-react",
      "clsx",
      "tailwind-merge",
    ],
    // Optimize CSS with Lightning CSS (faster than postcss)
    optimizeCss: false,
  },

  // Externalize native/Node-heavy SFTP packages so Turbopack doesn't try to
  // place ssh2 internals into ESM chunks during server builds on Vercel.
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],

  /*
  // Keep Turbopack rooted at the monorepo workspace so hoisted dependencies resolve consistently.
  turbopack: {
    root: workspaceRoot,
  },
  */

  // Redirects for legacy routes
  async redirects() {
    return [
      // ── Storefront: legacy query-param URLs → canonical slug URLs ──
      // /products?category=dog-food → /c/dog-food (301 permanent)
      {
        source: '/products',
        has: [{ type: 'query', key: 'category', value: '(?<slug>.+)' }],
        destination: '/c/:slug',
        permanent: true,
      },
      // /products?brand=purina → /b/purina (301 permanent)
      {
        source: '/products',
        has: [{ type: 'query', key: 'brand', value: '(?<slug>.+)' }],
        destination: '/b/:slug',
        permanent: true,
      },
    ];
  },

  // Headers for security and performance
  async headers() {
    return [
      // Enable DNS prefetch for performance
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
