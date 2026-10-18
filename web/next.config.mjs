/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // paper.js carries a Node-only branch that needs jsdom and canvas. The browser never takes it.
    config.resolve.alias = { ...config.resolve.alias, jsdom: false, canvas: false };
    return config;
  },
};

export default nextConfig;
