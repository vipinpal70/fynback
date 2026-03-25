import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  splitting: false,
  // Bundle @fynback/* workspace packages inline — they're TypeScript source
  // (main: "src/index.ts") and can't be loaded directly by Node.js.
  // All other deps (bullmq, ioredis, resend, etc.) stay external and are
  // loaded from node_modules at runtime as normal.
  noExternal: [/@fynback\/.*/],
});
