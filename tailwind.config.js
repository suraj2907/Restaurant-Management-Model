/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f5f2',
        surface: '#ffffff',
        border: '#e4e1da',
        ink: '#2a2620',
        muted: '#7a756a',
        accent: { DEFAULT: '#b5541a', dark: '#8f4114' },
        good: '#3f7d47',
        bad: '#b23b3b'
      }
    }
  },
  plugins: []
};
