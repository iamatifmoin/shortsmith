/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @shortsmith/shared ships as a workspace TS package; let Next transpile it.
  transpilePackages: ['@shortsmith/shared'],
};

export default nextConfig;
