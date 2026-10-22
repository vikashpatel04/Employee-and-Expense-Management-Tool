import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@fincrew/core', '@fincrew/db', '@fincrew/i18n', '@fincrew/ui'],
};

export default config;
