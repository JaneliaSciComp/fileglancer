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
        background: '#030712',
        foreground: '#9CA3AF',
        surface: {
          default: '#1F2937', // gray-800
          dark: '#111827', // gray-900
          light: '#374151', // gray-700
          foreground: '#E5E7EB' // gray-200
        },
        primary: {
          default: '#36a9b0',
          dark: '#058d96',
          light: '#66c7d0',
          foreground: '#E5E7EB'
        },
        secondary: {
          default: '#8B5CF6',
          dark: '#6D28D9',
          light: '#C4B5FD',
          foreground: '#E5E7EB'
        },
        success: {
          default: '#22c55e', // main success color (green-500)
          dark: '#052e16', // darker variant (green-950)
          light: '#6ee7b7', // lighter variant (emerald-300)
          foreground: '#E5E7EB' // text color for use on default/dark backgrounds
        },
        info: {
          default: '#3b82f6', // main info color (blue-500)
          dark: '#172554', // darker variant (blue-950) - visually darker
          light: '#93c5fd', // lighter variant (blue-300) - visually lighter
          foreground: '#E5E7EB' // text color for use on default/dark backgrounds
        },
        warning: {
          default: '#f59e0b', // main warning color (amber-500)
          dark: '#451a03', // darker variant (amber-950) - visually darker
          light: '#fcd34d', // lighter variant (amber-300) - visually lighter
          foreground: '#E5E7EB' // text color for use on default/dark backgrounds
        },
        error: {
          default: '#ef4444', // main error color (red-500)
          dark: '#450a0a', // darker variant (red-950) - visually darker
          light: '#fca5a5', // lighter variant (red-300) - visually lighter
          foreground: '#E5E7EB' // text color for use on default/dark backgrounds
        }
      }
    })
  ]
};

export default config;
