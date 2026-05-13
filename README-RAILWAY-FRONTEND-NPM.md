# Frontend Angular listo para Railway sin Dockerfile y sin pnpm

Esta versión está preparada para Railway con Railpack usando NPM puro.

## Archivos clave

- package.json
- package-lock.json
- angular.json
- src/
- railpack.json
- .npmrc

## Importante

No usa Dockerfile.
No usa pnpm.
No usa packageManager en package.json.

Railway ejecutará:

```bash
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
npm start
```

## Railway

En el servicio frontend:

- Builder: Railpack
- Root Directory: vacío si este repo contiene package.json en la raíz.

## Subida recomendada

Ejecuta estos comandos desde la carpeta donde están package.json y angular.json:

```bash
git init
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/RicardoToledoB/gestionpresupuestaria-frontend.git

git add .
git commit -m "deploy: frontend angular npm railway limpio" || true
git push origin main --force
```
