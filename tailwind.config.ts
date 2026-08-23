import type { Config } from 'tailwindcss';

/**
 * Tokens are ported verbatim from the Moniteq design system handoff
 * (`_ds/.../tokens/*.css`). Do not add a colour, radius, shadow or type size
 * that is not on this list without recording why — the handoff is the source
 * of truth for visual decisions.
 *
 * One deliberate deviation, carried from the brief: the brand sheet names sky
 * `#0284C7` as the accent, but the prototype barely uses it. Violet `#4F46E5`
 * is the real interactive colour, so `action` is violet and `accent` (sky) is
 * kept only for the rare places the sheet calls for it.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Structure
        primary: '#1E1B4B',
        secondary: '#314363',
        accent: '#0284C7',

        // Surfaces
        page: '#FAF7F5',
        'page-alt': '#F5EFEA',
        surface: '#FFFFFF',
        sunken: '#F4F4F5',

        // Text
        heading: '#1E1B4B',
        body: '#27272A',
        /*
          `muted` and `subtle` are not in the Section 1 palette — they are the
          tertiary-text steps this UI needed, so they are documented here.

          `muted` started at zinc-500 #71717A and was darkened to #5F5F68: at
          11px on cream-200 (#F3EEEA, the hovered-row background) zinc-500
          measures 4.19:1, below the 4.5:1 WCAG AA threshold, and only 4.53:1
          on the page background. #5F5F68 measures 6.32:1 on white, 6.02:1 on
          the page and 5.58:1 on cream-200, and is visually near-identical.

          `subtle` is decorative only — icon strokes, dividers and placeholder
          hints. It must never carry text that has to be read.
        */
        muted: '#5F5F68',
        subtle: '#A1A1AA',

        // Borders
        hairline: '#E4E4E7',
        'border-default': '#D4D4D8',
        'border-strong': '#8697B2',

        // The action colour
        action: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          press: '#332BA8',
          soft: '#F5EEFF',
        },

        navy: {
          900: '#0B1033',
          800: '#141A44',
          700: '#1D2255',
          600: '#2A3070',
        },
        indigo: {
          950: '#12102E',
          900: '#1E1B4B',
          800: '#2A2663',
          100: '#E4E3F1',
          50: '#F1F0F9',
        },
        slate: {
          700: '#314363',
          600: '#455A7F',
          400: '#8697B2',
          200: '#D3DAE5',
          100: '#E8ECF2',
          50: '#F4F6FA',
        },
        cream: {
          100: '#FAF7F5',
          200: '#F3EEEA',
          300: '#E9E2DC',
        },

        // Status: full strength for icons/figures, tint for surfaces
        success: {
          DEFAULT: '#0EA765',
          /*
            Section 1 gives success text as #008C51. Measured, that is 3.75:1
            on its own tint (#DFF4E8), 4.00:1 on the soft surface and 4.31:1
            on white — below WCAG AA 4.5:1 everywhere it is actually used, and
            success badges are 11px. Darkened to #046A3E: 5.82 / 6.21 / 6.70.
            The other status text colours were measured too and all pass
            (warning #B45309 = 4.53 on tint, error #B91C2C = 5.30), so only
            this one moved. Flagged in the Phase 2 report for design sign-off.
          */
          text: '#046A3E',
          tint: '#DFF4E8',
          soft: '#E8FBEF',
        },
        warning: {
          DEFAULT: '#F3A111',
          text: '#B45309',
          tint: '#FEF1E7',
          soft: '#FEF7EC',
        },
        error: {
          DEFAULT: '#DC2334',
          text: '#B91C2C',
          tint: '#FAE4E7',
          soft: '#FCECEE',
        },
        info: {
          DEFAULT: '#0F61C3',
          tint: '#F5EEFF',
          soft: '#F2FAFE',
        },

        // Category icon tiles
        tint: {
          violet: '#F5EEFF',
          green: '#DFF4E8',
          red: '#FAE4E7',
          mint: '#E8FBEF',
          peach: '#FEF1E7',
        },

        // Chart series, in the donut legend order from the kit sheet
        chart: {
          1: '#3748F0',
          2: '#20A2C4',
          3: '#5071ED',
          4: '#4C37D8',
          5: '#2826AC',
          6: '#086F75',
          7: '#F32E55',
          grid: '#E4E4E7',
          track: '#EEF0F5',
        },
      },

      fontFamily: {
        // Fed by next/font/google, which self-hosts the face at build time.
        sans: ['var(--font-poppins)', 'Poppins', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      fontSize: {
        caption: ['11px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        'body-2': ['12px', { lineHeight: '1.5' }],
        'body-1': ['14px', { lineHeight: '1.5' }],
        h4: ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h2: ['24px', { lineHeight: '1.25', fontWeight: '600' }],
        h1: ['32px', { lineHeight: '1.2', fontWeight: '700' }],
      },

      borderRadius: {
        control: '10px',
        card: '14px',
        panel: '20px',
        modal: '20px',
        pill: '999px',
      },

      boxShadow: {
        sm: '0 1px 2px 0 rgba(30,27,75,.06), 0 1px 1px 0 rgba(30,27,75,.04)',
        md: '0 4px 10px -2px rgba(30,27,75,.12), 0 2px 4px -2px rgba(30,27,75,.08)',
        xl: '0 20px 40px -8px rgba(30,27,75,.28), 0 8px 16px -4px rgba(30,27,75,.16)',
        focus: '0 0 0 3px rgba(79,70,229,.28)',
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,.6,.25,1)',
      },
      transitionDuration: {
        control: '140ms',
        surface: '220ms',
        overlay: '340ms',
        value: '520ms',
      },

      backgroundImage: {
        'sidebar-rail': 'linear-gradient(180deg,#0B1033,#141A44)',
      },

      spacing: {
        sidebar: '248px',
        'sidebar-collapsed': '72px',
        topbar: '64px',
      },

      maxWidth: {
        app: '1280px',
        prose: '660px',
      },
    },
  },
  plugins: [],
};

export default config;
