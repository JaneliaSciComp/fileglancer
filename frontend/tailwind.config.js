import plugin from 'tailwindcss';
import { mtConfig } from '@material-tailwind/react';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/**/*.{html,js,jsx,ts,tsx}',
    './node_modules/@material-tailwind/react/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      backgroundImage: {
        'hover-gradient':
          'linear-gradient(120deg, rgb(var(--color-primary-light) / 0.2) , rgb(var(--color-secondary-light) / 0.2))',
        'hover-gradient-dark':
          'linear-gradient(120deg, rgb(var(--color-primary-dark) / 0.4), rgb(var(--color-secondary-dark) / 0.4))'
      },
      screens: {
        short: { raw: '(min-height: 0px) and (max-height: 420px)' }
      },
      // Animation to make elements immediately appear (used for file browser skeleton loader)
      //https://stackoverflow.com/questions/73802482/tailwind-css-transition-on-load
      keyframes: {
        appear: {
          '0%': {
            opacity: '0'
          },
          '100%': {
            opacity: '1'
          }
        }
      },
      animation: {
        appear: 'appear 0.01s ease-in-out backwards'
      }
    }
  },
  plugins: [
    // Custom plugin to add animation delay utility
    // https://github.com/tailwindlabs/tailwindcss/discussions/3378#discussioncomment-4177286
    plugin(({ matchUtilities, theme }) => {
      matchUtilities(
        {
          'animation-delay': value => {
            return {
              'animation-delay': value
            };
          }
        },
        {
          values: theme('transitionDelay')
        }
      );
    }),
    mtConfig({
      colors: {
        background: '#FFFFFF',
        foreground: '#4B5563',
        surface: {
          default: '#E5E7EB', // gray-200
          dark: '#D1D5DB', // gray-300
          light: '#F9FAFB', // gray-50
          foreground: '#1F2937' // gray-800
        },
        primary: {
          default: '#058d96', // HHMI primary brand color
          dark: '#04767f',
          light: '#36a9b0',
          foreground: '#FFFFFF'
        },
        secondary: {
          default: '#6D28D9', // Purple color
          dark: '#4C1D95',
          light: '#8B5CF6',
          foreground: '#FFFFFF'
        },
        success: {
          default: '#16a34a', // main success color (green-600)
          dark: '#15803d', // darker variant (green-700)
          light: '#f0fdf4', // lighter variant (green-50)
          foreground: '#FFFFFF' // text color for use on default/dark backgrounds
        },
        info: {
          default: '#2563eb', // main info color (blue-600)
          dark: '#1d4ed8', // darker variant (blue-700)
          light: '#eff6ff', // lighter variant (blue-50)
          foreground: '#FFFFFF' // text color for use on default/dark backgrounds
        },
        warning: {
          default: '#d97706', // main warning color (amber-600)
          dark: '#92400e', // darker variant (amber-800)
          light: '#fffbeb', // lighter variant (amber-50)
          foreground: '#FFFFFF' // text color for use on default/dark backgrounds
        },
        error: {
          default: '#dc2626', // main error color (red-600)
          dark: '#991b1b', // darker variant (red-800)
          light: '#fef2f2', // lighter variant (red-50)
          foreground: '#FFFFFF' // text color for use on default/dark backgrounds
        }
      },
      darkColors: {
        background: '#111827', // was #030712 (gray-950) — softened to gray-900 to reduce eye strain
        foreground: '#D1D5DB', // was #9CA3AF (gray-400) — brightened to gray-300 for comfortable reading
        surface: {
          default: '#1F2937', // gray-800 (unchanged — now has breathing room from bg)
          dark: '#171f2e', // slightly darker than surface, clearly distinct from bg
          light: '#374151', // gray-700 (unchanged)
          foreground: '#F3F4F6' // was #E5E7EB — now gray-100, crisper headings
        },
        primary: {
          default: '#45bcc4', // balanced teal — visible for text/outlines, not washed out for buttons
          dark: '#36a9b0', // deeper variant — good for text on dark surfaces
          light: '#5cc8cf', // lighter variant for hover/decorative use
          foreground: '#F3F4F6'
        },
        secondary: {
          default: '#A78BFA', // was #8B5CF6 — violet-400, better contrast on surfaces
          dark: '#8B5CF6', // was #6D28D9 — bumped to pass AA on background
          light: '#DDD6FE', // was #C4B5FD — lighter for decorative use
          foreground: '#F3F4F6'
        },
        success: {
          default: '#4ade80', // was #22c55e — green-400 (brighter)
          dark: '#0a3d1e', // was #052e16 — slightly lighter for better contrast
          light: '#86efac', // was #6ee7b7
          foreground: '#F3F4F6'
        },
        info: {
          default: '#60a5fa', // was #3b82f6 — blue-400 (brighter)
          dark: '#1e3a5f', // was #172554 — lighter bg for better contrast with text
          light: '#93c5fd',
          foreground: '#F3F4F6'
        },
        warning: {
          default: '#fbbf24', // was #f59e0b — amber-400
          dark: '#5c2d0e', // was #451a03 — slightly lighter
          light: '#fcd34d',
          foreground: '#F3F4F6'
        },
        error: {
          default: '#f87171', // was #ef4444 — red-400 (brighter)
          dark: '#5c1414', // was #450a0a — lighter for better contrast
          light: '#fca5a5',
          foreground: '#F3F4F6'
        }
      }
    })
  ]
};

export default config;
