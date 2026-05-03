import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  // GitHub Pages serves the site at https://<user>.github.io/hld/
  // so every asset and route needs the /hld prefix in production.
  basePath: isProd ? '/hld' : '',
  assetPrefix: isProd ? '/hld' : '',
};

export default withMDX(config);
