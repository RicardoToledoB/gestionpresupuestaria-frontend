# Frontend Railway limpio

Este frontend está preparado para Railway sin Dockerfile, sin pnpm y sin package-lock.

Railway debe construir con NPM install normal, no con npm ci.

Archivos esperados en la raíz del repo:
- package.json
- angular.json
- src/
- .npmrc

Configuración Railway:
- Builder: Railpack
- Root Directory: vacío

Si Railway sigue usando pnpm o npm ci, limpiar el repo y volver a subir solo estos archivos.
