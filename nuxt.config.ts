import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },

  runtimeConfig: {
    public: {
      baseUrl: process.env.VITE_BASE_URL || 'https://openbackgrounds.com'
    }
  },

  nitro: {
    preset: "cloudflare_pages",
    compressPublicAssets: true,
  },
  vite: {
    server: {
      allowedHosts: true
    }
  },

  modules: [
    "@nuxt/eslint",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxtjs/tailwindcss",
    // "@nuxtjs/color-mode",
    // "@nuxtjs/seo",
    // '@sentry/nuxt/module',
    "@nuxtjs/google-fonts",
    // 'nuxt-mcp',
  ],

  tailwindcss: {
    cssPath: "~/assets/css/tailwind.css",
    configPath: "tailwind.config.ts",
    exposeConfig: false,
    viewer: true,
  },

  postcss: {
    plugins: {
      "postcss-import": {},
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  app: {
    head: {
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ],
      meta: [
        { name: 'apple-mobile-web-app-title', content: 'OpenBackgrounds' }
      ]
    },
  },

  image: {
    provider: process.env.NODE_ENV === 'production' ? 'ipxStatic' : 'ipx',
    quality: 80,
    format: ["webp"],
    domains: [],
    dir: 'public',
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536
    },
    densities: [1, 2],
    presets: {
      blog: {
        modifiers: {
          format: 'webp',
          quality: 80,
          width: 800,
          height: 450
        }
      }
    }
  },

  googleFonts: {
    families: {
      Poppins: [300, 400, 500, 600, 700],
    },
    display: "swap",
    prefetch: true,
    preconnect: true,
  },

  site: {
    url: 'https://openbackgrounds.com',
    name: 'My Website',
  },

  ogImage: {
    enabled: true,
    defaults: {
      component: 'NuxtSeo',
    },
  },

  seo: {
    meta: {
      ogImage: 'https://openbackgrounds.com/og.png',
      twitterCard: 'summary_large_image',
      themeColor: '#9333ea',
      robots: 'index, follow',
    }
  },

  schemaOrg: {
    identity: 'Organization',
  },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    hid: 'nuxt-color-mode-script',
    globalName: '__NUXT_COLOR_MODE__',
    componentName: 'ColorScheme',
    classPrefix: '',
    classSuffix: '',
    storageKey: 'nuxt-color-mode'
  },

  i18n: {
    baseUrl: 'https://openbackgrounds.com',
    compilation: {
      strictMessage: false,
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
      alwaysRedirect: false,
      cookieCrossOrigin: false,
      cookieSecure: true
    },
    locales: [
      {
        code: 'en',
        language: 'en-US',
        name: 'English',
        file: 'en/common.json'
      },
      {
        code: 'nl',
        language: 'nl-NL',
        name: 'Nederlands',
        file: 'nl/common.json'
      }
    ],
    defaultLocale: 'en',
    strategy: 'prefix_except_default'
  },

  compatibilityDate: "2024-12-26",

  // sentry: {
  //   enabled: process.env.NODE_ENV === 'production',
  //   sourceMapsUploadOptions: {
  //     telemetry: false,
  //     org: 'boring-dystopia-development',
  //     project: 'openbackgrounds.com',
  //   },
  // },

  sourcemap: {
    client: 'hidden',
  },
});