# Frontend Railway sin Dockerfile

Este frontend está preparado para desplegar en Railway con Railpack, sin Dockerfile.

## Archivos importantes

- `railpack.json`: fuerza a Railway/Railpack a usar `npm install --include=dev --no-audit --no-fund` en lugar de `npm ci`.
- `.npmrc`: evita auditorías/funding y asegura instalación de dependencias de desarrollo necesarias para `ng build`.
- No se incluye `Dockerfile`.
- No se incluye `package-lock.json` para evitar que Railpack intente usar `npm ci`.

## Comandos Railway esperados

Railpack leerá `railpack.json` y ejecutará:

```bash
npm install --include=dev --no-audit --no-fund
npm run build
npm start
```

## Recomendación Railway

En el servicio frontend:

- Builder: Railpack
- Root Directory: vacío si el repo frontend tiene `package.json` en la raíz.
- Redeploy después del push.

