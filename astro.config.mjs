import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import netlify from '@astrojs/netlify';

// En Netlify (variable NETLIFY=true durante el build) se publica como funciones;
// en Docker o en la PC se usa el servidor Node.
const enNetlify = process.env.NETLIFY === 'true';

export default defineConfig({
  output: 'server',
  adapter: enNetlify ? netlify() : node({ mode: 'standalone' }),
  server: { host: true, port: 4321 },
});
