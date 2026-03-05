import { MetadataRoute } from 'next';

/**
 * Generates the robots.txt configuration.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: '/admin/',
        },
        sitemap: 'https://baystatepetgarden.com/sitemap.xml',
    };
}
