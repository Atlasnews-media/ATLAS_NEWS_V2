import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://atlasnews-media.github.io",
  base: "/lab",
  fonts: [
    {
      name: "Roboto Condensed",
      cssVariable: "--font-atlas-sans",
      provider: fontProviders.fontsource(),
      weights: [400, 700, 800],
      styles: ["normal"],
      subsets: ["latin"],
      formats: ["woff2"],
      fallbacks: ["Arial", "sans-serif"],
      display: "swap",
    },
  ],
});
