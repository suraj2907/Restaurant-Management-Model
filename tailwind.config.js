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
        bg: '#FAF7F2',
        well: '#F4EFEB',
        surface: '#FFFFFF',
        border: '#E6DFD5',
        ink: '#212529',
        muted: '#6C727A',
        accent: { DEFAULT: '#B5541A', dark: '#9A4312', active: '#C85E22' },
        secondary: { DEFAULT: '#E0871B', container: '#FEF3C7', dark: '#C66F0E' },
        good: { DEFAULT: '#1E7E34', container: '#D4EDDA', text: '#0F4B1E' },
        bad: { DEFAULT: '#C92A2A', container: '#F8D7DA', text: '#781313' },
        pending: { DEFAULT: '#D97706', container: '#FEF3C7', text: '#783D04' },
        info: { DEFAULT: '#2563EB', container: '#DBEAFE', text: '#1E40AF' }
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
