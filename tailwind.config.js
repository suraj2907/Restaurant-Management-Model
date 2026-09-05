/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        // Restro Hisaab v2 palette (Terracotta Amber POS utility theme).
        bg: '#F8FAFC',
        well: '#F1F5F9',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        ink: '#0F172A',
        muted: '#64748B',
        accent: { DEFAULT: '#D9531E', dark: '#BF4413', active: '#C2410C' },
        secondary: { DEFAULT: '#F59E0B', container: '#FEF3C7', dark: '#B45309' },
        good: { DEFAULT: '#15803D', container: '#DCFCE7', text: '#166534' },
        bad: { DEFAULT: '#DC2626', container: '#FEE2E2', text: '#B91C1C' },
        pending: { DEFAULT: '#D97706', container: '#FEF3C7', text: '#92400E' },
        info: { DEFAULT: '#0369A1', container: '#E0F2FE', text: '#0369A1' }
      },
      boxShadow: {
        card: '0 1px 3px rgba(33,37,41,0.04), 0 1px 2px rgba(33,37,41,0.02)',
        tile: '0 2px 6px rgba(181,84,26,0.06), 0 1px 3px rgba(33,37,41,0.05)',
        panel: '-4px 0 16px rgba(33,37,41,0.06)',
        modal: '0 12px 32px rgba(33,37,41,0.12), 0 2px 6px rgba(33,37,41,0.08)'
      }
    }
  },
  plugins: []
};
