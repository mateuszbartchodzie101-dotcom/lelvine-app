# LELVINE App Starter

Pierwsza wersja panelu LELVINE z Supabase Auth.

## Supabase
Utwórz `.env` na podstawie `.env.example`:

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

Nie dodawaj Secret Key / service_role do frontendu.

## Local
npm install
npm run dev

## Cloudflare build
Build command: npm run build
Output directory: dist

Environment variables:
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY

Po wdrożeniu ustaw w Supabase -> Authentication -> URL Configuration:
Site URL: https://app.lelvine.com
Redirect URLs: https://app.lelvine.com/**
