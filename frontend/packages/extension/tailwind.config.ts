import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  corePlugins: {
    preflight: false,
  },
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
