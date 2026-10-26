import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@fincrew/core',
    '@fincrew/data',
    '@fincrew/db',
    '@fincrew/i18n',
    '@fincrew/ui',
  ],
  experimental: {
    // Staff documents can be PDFs up to the bucket's 4 MB (photos are shrunk in the browser);
    // the default server action limit is 1 MB.
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default config;
