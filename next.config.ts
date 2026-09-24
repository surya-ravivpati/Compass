import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite ships WASM and data files that it loads relative to its own module;
  // bundling it breaks those paths, so the server requires it from node_modules.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  typedRoutes: true,
}

export default nextConfig
