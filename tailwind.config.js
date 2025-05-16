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
      }
    }
  },
  plugins: [
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
          default: '#00a450', // HHMI primary brand color
          dark: '#008f44',
          light: '#33b473',
          foreground: '#FFFFFF'
        },
        info: {
          default: '#2563EB',
          dark: '#1D4ED8',
          light: '#3B82F6',
          foreground: '#FFFFFF'
        },
        warning: {
          default: '#DD8235', // HHMI accent brand color
          dark: '#B66F2B',
          light: '#F2A860',
          foreground: '#030712'
        },
        error: {
          default: '#DC2626',
          dark: '#B91C1C',
          light: '#EF4444',
          foreground: '#FFFFFF'
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
          foreground: '#030712'
        },
        secondary: {
          default: '#8B5CF6',
          dark: '#6D28D9',
          light: '#C4B5FD',
          foreground: '#FFFFFF'
        },
        success: {
          default: '#33b473',
          dark: '#00a450',
          light: '#66cba2',
          foreground: '#030712'
        },
        info: {
          default: '#3B82F6',
          dark: '#2563EB',
          light: '#60A5FA',
          foreground: '#FFFFFF'
        },
        warning: {
          default: '#F2A860',
          dark: '#DD8235',
          light: '#FFBF70',
          foreground: '#030712'
        },
        error: {
          default: '#EF4444',
          dark: '#DC2626',
          light: '#F87171',
          foreground: '#FFFFFF'
        }
      }
    })
  ]
};

export default config;
