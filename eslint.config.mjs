import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships native flat configs, so they are imported
 * directly. Routing them through FlatCompat, as older setups did, throws on a
 * circular reference while validating the legacy schema.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'] },
];

export default config;
