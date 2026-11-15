import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the shared workspace package (it ships TypeScript source).
  transpilePackages: ['@studylens/shared'],
};

export default nextConfig;
