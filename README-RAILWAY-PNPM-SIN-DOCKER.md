# Frontend Railway sin Dockerfile usando pnpm

Esta versión evita el error de Railway con `npm ci` / `npm install` usando pnpm vía Corepack.

## Archivos relevantes

- `package.json`: usa `packageManager: pnpm@9.15.9`.
- `railpack.json`: fuerza Node 20.19.0, instala pnpm y ejecuta `pnpm install --no-frozen-lockfile`.
- No usa `Dockerfile`.
- No usa `package-lock.json`.

## Railway

En el servicio frontend:

- Builder: Railpack
- Root Directory: vacío, si este repositorio contiene `package.json` en la raíz.
- Start Command: dejar vacío o permitir que tome `pnpm start` desde `railpack.json`.

## Subida Git

```bash
cd frontend

git init
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/RicardoToledoB/gestionpresupuestaria-frontend.git

git add .
git commit -m "fix: frontend railway pnpm sin dockerfile"
git push origin main --force
```
