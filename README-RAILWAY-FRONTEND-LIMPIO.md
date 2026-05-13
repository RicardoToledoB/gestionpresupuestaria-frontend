# Frontend Railway sin Dockerfile

Este frontend está preparado para subirlo como repositorio separado `gestionpresupuestaria-frontend`.

## Estructura correcta del repo frontend

En GitHub, en la raíz del repo frontend, deben verse directamente:

```text
package.json
angular.json
src/
railpack.json
.npmrc
```

No debe quedar así:

```text
frontend/package.json
```

Si queda dentro de una carpeta `frontend`, Railway debe tener `Root Directory = frontend`.
Si `package.json` está en la raíz, Railway debe tener `Root Directory` vacío.

## Comandos recomendados

Ejecutar desde esta carpeta `frontend`:

```bash
git init
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/RicardoToledoB/gestionpresupuestaria-frontend.git

git add .
git commit -m "deploy: frontend angular limpio railpack" || true
git push origin main --force
```

## Railway

- Builder: Railpack
- Root Directory: vacío, si subiste esta carpeta como raíz del repo.
- No usar Dockerfile.

Railpack usará:

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --no-frozen-lockfile
pnpm run build
pnpm start
```
