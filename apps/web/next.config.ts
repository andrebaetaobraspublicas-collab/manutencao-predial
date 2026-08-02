import path from 'node:path';
import type { NextConfig } from 'next';

const isHostingerStaticExport = process.env.HOSTINGER_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  output: isHostingerStaticExport ? 'export' : 'standalone',
  ...(isHostingerStaticExport
    ? { images: { unoptimized: true }, trailingSlash: true }
    : { outputFileTracingRoot: path.join(process.cwd(), '../..') }),
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
