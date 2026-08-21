/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Основная палитра сервиса грузчиков — синий + акцентный оранжевый
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        // Яркая "неоновая" палитра для фона и свечений
        neon: {
          blue: '#38bdf8',
          violet: '#8b5cf6',
          fuchsia: '#d946ef',
          pink: '#f472b6',
          amber: '#fbbf24',
          emerald: '#34d399',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        // Мягкие неоновые свечения (для glass-панелей и кнопок)
        glow: '0 0 20px rgba(99, 102, 241, 0.35), 0 4px 14px rgba(99, 102, 241, 0.25)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.45), 0 8px 24px rgba(99, 102, 241, 0.3)',
        'glow-blue': '0 0 18px rgba(56, 189, 248, 0.45), 0 4px 14px rgba(56, 189, 248, 0.25)',
        'glow-violet': '0 0 18px rgba(139, 92, 246, 0.5), 0 4px 14px rgba(139, 92, 246, 0.3)',
        'glow-fuchsia': '0 0 18px rgba(217, 70, 239, 0.45), 0 4px 14px rgba(217, 70, 239, 0.25)',
        'glow-amber': '0 0 18px rgba(251, 191, 36, 0.5), 0 4px 14px rgba(251, 191, 36, 0.3)',
        'glow-emerald': '0 0 18px rgba(52, 211, 153, 0.45), 0 4px 14px rgba(52, 211, 153, 0.25)',
        'glass': '0 8px 32px rgba(31, 38, 135, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        'glass-sm': '0 4px 16px rgba(31, 38, 135, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
        'card': '0 4px 20px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        // Плавное движение mesh-пятен фона — только transform, без перерисовки
        blob: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(40px, -60px) scale(1.15)' },
          '66%': { transform: 'translate(-30px, 30px) scale(0.9)' },
        },
        'blob-2': {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '40%': { transform: 'translate(-50px, 40px) scale(1.2)' },
          '70%': { transform: 'translate(30px, -30px) scale(0.85)' },
        },
        'blob-3': {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '30%': { transform: 'translate(60px, 50px) scale(0.9)' },
          '75%': { transform: 'translate(-40px, -50px) scale(1.18)' },
        },
        // Лёгкое покачивание карточек и элементов
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        // Мягкая пульсация свечения (opacity)
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        // Бегущий блик по кнопке/карточке (transform: translateX)
        shimmer: {
          '0%': { transform: 'translateX(-150%) skewX(-20deg)' },
          '100%': { transform: 'translateX(250%) skewX(-20deg)' },
        },
        // Вращение декоративного кольца
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        // Появление контента (opacity + translateY)
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0px)' },
        },
        // Пульс живой точки "в сети"
        'ping-dot': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
      },
      animation: {
        blob: 'blob 14s ease-in-out infinite',
        'blob-2': 'blob-2 17s ease-in-out infinite',
        'blob-3': 'blob-3 20s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.8s ease-in-out infinite',
        'spin-slow': 'spin-slow 12s linear infinite',
        'fade-up': 'fade-up 0.35s ease-out both',
        'ping-dot': 'ping-dot 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
