
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			/* Nunito everywhere — one typeface, no exceptions.
			   `mono` points at it too, so the ~38 `font-mono` spots (rule ids,
			   invoice numbers, GSTINs, LR numbers) stay semantically labelled in
			   the markup but render in Nunito like everything else. Digits still
			   line up because those cells also carry `tabular-nums`. */
			fontFamily: {
				sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
				mono: ['Nunito', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
			},
			colors: {
				/* Kurchi brand ramps — carried over from the `ecommerce` app so the
				   three apps read as one company. bright-red is the identity colour;
				   the applied tones are 600–800, not the #ff0000 base. */
				'bright-red': {
					50: '#fff1f1',
					100: '#ffdfdf',
					200: '#ffc4c4',
					300: '#ff9d9d',
					400: '#ff6969',
					500: '#ff0000',
					600: '#d90000',
					700: '#b30000',
					800: '#8c0000',
					900: '#660000',
					DEFAULT: '#ff0000',
				},
				tomato: {
					50: '#fff5f4',
					100: '#ffe8e6',
					200: '#ffd2cc',
					300: '#ffada1',
					400: '#ff7e6b',
					500: '#ff6347',
					600: '#ef4a2e',
					700: '#c93922',
					800: '#a6301e',
					900: '#8c2c1d',
					DEFAULT: '#ff6347',
				},
				sunken: 'hsl(var(--sunken))',
				grid: 'hsl(var(--grid))',
				rail: {
					DEFAULT: 'hsl(var(--rail))',
					foreground: 'hsl(var(--rail-foreground))',
					muted: 'hsl(var(--rail-muted))',
					hover: 'hsl(var(--rail-hover))',
					border: 'hsl(var(--rail-border))',
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
			/* NOTE: the scaffold template shipped a second `fontFamily` block here
			   declaring Inter. Being a duplicate key in the same object it silently
			   won over the one above. Fonts live in ONE place — the top of `extend`. */
		}
	},
	plugins: [animate],
} satisfies Config;
