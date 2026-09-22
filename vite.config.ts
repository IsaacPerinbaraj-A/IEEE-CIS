import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import adminLocalBackend from './admin-local-backend'
import { PAGE_ROUTES } from './src/lib/routeTable'

/**
 * Deep links (for example a shared event page): each page's code is a separate file (src/lib/routes.ts), which the
 * browser would only discover after the main bundle has downloaded and run. This adds a tiny inline script to
 * index.html that starts downloading the opened page's code (and what it imports) together with the main bundle.
 * The URL patterns come from src/lib/routeTable.ts, so they always match the app's routes. Build only.
 */
/** Font files (by fontsource name) to fetch together with the main bundle instead of after the first render. */
const FONT_PRELOAD: string[] = []

function pagePreload(): Plugin {
  let base = '/'
  return {
    name: 'cis-page-preload',
    apply: 'build',
    configResolved(config) { base = config.base },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const chunks = Object.values(bundle).flatMap(c => (c.type === 'chunk' ? [c] : []))
        // Files index.html already loads: the entry and everything it imports
        const upfront = new Set<string>()
        const walk = (file: string, into: Set<string>) => {
          if (upfront.has(file) || into.has(file)) return
          into.add(file)
          const c = bundle[file]
          if (c?.type === 'chunk') c.imports.forEach(f => walk(f, into))
        }
        chunks.filter(c => c.isEntry).forEach(c => walk(c.fileName, upfront))
        const routes = PAGE_ROUTES.flatMap(([path, name]) => {
          const chunk = chunks.find(c => c.facadeModuleId?.replace(/\\/g, '/').endsWith(`/src/pages/${name}.tsx`))
          if (!chunk) return []
          const files = new Set<string>()
          walk(chunk.fileName, files)
          return [[path.toLowerCase().split('/'), [...files].map(f => base + f)] as const]
        })
        // Same matching as React Router for these routes: case-insensitive, trailing slash ignored, ":x" is one segment, "*" anything
        const script = `(function(){try{var r=${JSON.stringify(routes)},s=location.pathname.toLowerCase().split("/").filter(Boolean);`
          + `if(!s.length||s[0]==="admin")return;for(var i=0;i<r.length;i++){var p=r[i][0];`
          + `if(p[0]!=="*"&&(p.length!==s.length||p.some(function(x,j){return x.charAt(0)!==":"&&x!==s[j]})))continue;`
          + `r[i][1].forEach(function(f){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=f;document.head.appendChild(l)});return}}catch(e){}})();`
        const fonts = Object.values(bundle).flatMap(a => (a.type === 'asset' && FONT_PRELOAD.some(n => a.fileName.includes(n + '-')) && a.fileName.endsWith('.woff2') ? [a.fileName] : []))
        const tags = [
          ...fonts.map(f => `<link rel="preload" href="${base + f}" as="font" type="font/woff2" crossorigin>`),
          ...(routes.length ? [`<script>${script}</script>`] : []),
        ]
        // Before the stylesheet, so the browser runs the script without waiting for the CSS
        return html.replace(/(\s*)<script type="module"/, (m, space: string) => tags.map(t => space + t).join('') + m)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminLocalBackend(), pagePreload()],
  build: {
    rollupOptions: {
      output: {
        // React and the router in their own file: it stays cached when the site's content or code changes
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
