import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          bg:      '#1C1917',
          surface: '#292524',
          hover:   '#3C3836',
          border:  '#44403C',
          text:    '#E7E5E4',
          muted:   '#A8A29E',
          faint:   '#78716C',
          accent:  '#D97757',
          'accent-hover': '#C26744',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'xs':   ['12px', { lineHeight: '1.5' }],
        'sm':   ['14px', { lineHeight: '1.6' }],
        'base': ['16px', { lineHeight: '1.75' }],
        'lg':   ['18px', { lineHeight: '1.7' }],
        'xl':   ['20px', { lineHeight: '1.6' }],
        '2xl':  ['24px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        'bubble': '12px',
        'btn':    '8px',
        'input':  '16px',
      },
    },
  },
  plugins: [],
};

export default config;
