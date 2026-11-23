/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: c('paper'), surface: c('surface'), sunken: c('sunken'),
        ink: { DEFAULT: c('ink'), 2: c('ink-2'), 3: c('ink-3') },
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        control: c('control'),
        accent: { DEFAULT: c('accent'), ink: c('accent-ink'), soft: c('accent-soft') },
        warn: { DEFAULT: c('warn'), soft: c('warn-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        cat: {
          food: c('cat-food'), transport: c('cat-transport'), housing: c('cat-housing'), bills: c('cat-bills'), shopping: c('cat-shopping'),
          entertainment: c('cat-entertainment'), education: c('cat-education'), health: c('cat-health'), gifts: c('cat-gifts'), other: c('cat-other'),
          salary: c('cat-salary'), allowance: c('cat-allowance'), parttime: c('cat-parttime'), bonus: c('cat-bonus'),
        },
      },
      fontFamily: { sans: ['Be Vietnam Pro', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.01em' }],
        '3xl': ['2.25rem', { lineHeight: '2.625rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: { md: '12px', lg: '16px', xl: '20px' },
      boxShadow: { float: 'var(--shadow-float)' },
      maxWidth: { page: '1120px' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'sheet-down': { from: { transform: 'translateY(var(--sheet-dy, 0px))' }, to: { transform: 'translateY(100%)' } },
        'dialog-in': { from: { opacity: '0', transform: 'translate(-50%, calc(-50% + 4px))' }, to: { opacity: '1', transform: 'translate(-50%, -50%)' } },
        'dialog-out': { from: { opacity: '1', transform: 'translate(-50%, -50%)' }, to: { opacity: '0', transform: 'translate(-50%, calc(-50% + 4px))' } },
        'ring-pulse': { from: { opacity: '0.3', transform: 'scale(1)' }, to: { opacity: '0', transform: 'scale(1.25)' } },
        'toast-out': { from: { opacity: '1' }, to: { opacity: '0', transform: 'translateY(4px)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out', 'rise-in': 'rise-in 180ms ease-out', 'sheet-up': 'sheet-up 220ms cubic-bezier(.2,.8,.2,1)', 'toast-in': 'toast-in 180ms ease-out',
        'fade-out': 'fade-out 150ms ease-in forwards', 'sheet-down': 'sheet-down 200ms cubic-bezier(.4,0,1,1) forwards', 'dialog-in': 'dialog-in 180ms ease-out', 'dialog-out': 'dialog-out 150ms ease-in forwards', 'ring-pulse': 'ring-pulse 600ms ease-out 1', 'toast-out': 'toast-out 150ms ease-in forwards',
      },
    },
  },
  plugins: [],
};
