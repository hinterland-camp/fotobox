import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["./app/assets/css/main.css"],
  runtimeConfig: {
    // Shared secret the booth sends when uploading. Set NUXT_UPLOAD_TOKEN in
    // the deployment; uploads are refused while it is empty.
    uploadToken: "",
  },
  app: {
    head: {
      htmlAttrs: { lang: "de" },
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        // Poppins and Lora, the two faces hinterland.camp is set in
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap",
        },
        { rel: "icon", type: "image/svg+xml", href: "/hinterland-logo.svg" },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
