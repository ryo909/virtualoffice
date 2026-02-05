# virtualoffice

## Dev Server

1. Install dependencies:
   `npm install`
2. Start Vite on IPv4 localhost with fixed port:
   `npm run dev`
3. Open:
   `http://127.0.0.1:5173/`

If port `5173` is already used, run with another port:
`npx vite --host 127.0.0.1 --port 5174 --strictPort`

If your environment listens only on IPv6, use:
`http://[::1]:5173/`

## Base Path Behavior

- Dev (`npm run dev`): `base = '/'`
- Build (`npm run build`): `base = '/virtualoffice/'` for GitHub Pages

`src/world/mapLoader.js` uses `new URL(..., import.meta.url)`, which works in both dev and build with the config above.
In dev, use `/` path root (not `/virtualoffice/`).
