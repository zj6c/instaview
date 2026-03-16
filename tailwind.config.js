/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans Arabic', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ig: {
          pink:   '#E1306C',
          purple: '#833AB4',
          orange: '#F77737',
          blue:   '#3797f0',
          dark:   '#0a0a0a',
          card:   '#111111',
          border: '#1e1e1e',
          muted:  '#666666',
          text:   '#f0f0f0',
        }
      },
      backgroundImage: {
        'ig-grad': 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
        'ig-grad-r': 'linear-gradient(135deg, #bc1888, #cc2366, #dc2743, #e6683c, #f09433)',
      },
      animation: {
        'fade-in':   'fadeIn .4s ease both',
        'slide-up':  'slideUp .4s ease both',
        'slide-in':  'slideIn .3s ease both',
        'pulse-slow':'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'none' } },
        slideIn: { from: { opacity: 0, transform: 'translateX(-16px)' }, to: { opacity: 1, transform: 'none' } },
      }
    },
  },
  plugins: [],
}
