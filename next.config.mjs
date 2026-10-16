/** @type {import('next').NextConfig} */
const nextConfig = {
  // The download library is local-only. On the hosted site (Vercel sets VERCEL=1
  // at build time) /library doesn't exist; anyone who types it lands on the homepage.
  async redirects() {
    if (!process.env.VERCEL) return [];
    return [{ source: "/library/:path*", destination: "/", permanent: false }];
  },
};

export default nextConfig;
