import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable strict React mode for better development experience
  reactStrictMode: true,

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
    // Minimum cache TTL for optimized images (1 minute)
    minimumCacheTTL: 60,
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
    optimizeCss: true,
  },

  // External packages that should not be bundled
  serverExternalPackages: [],

  // Redirects for legacy routes
  async redirects() {
    return [
      // Legacy scraper routes redirected to new studio
      {
        source: '/admin/scrapers/lab',
        destination: '/admin/scrapers/studio',
        permanent: true,
      },
      {
        source: '/admin/scrapers/lab/:path*',
        destination: '/admin/scrapers/studio',
        permanent: true,
      },
      {
        source: '/admin/scrapers/test-lab',
        destination: '/admin/scrapers/studio',
        permanent: true,
      },
      {
        source: '/admin/scrapers/test-lab/:path*',
        destination: '/admin/scrapers/studio',
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
