# Railway Frontend sin Dockerfile

Esta versión está preparada para desplegarse con Railpack, sin Dockerfile.

Archivos importantes:
- `railpack.json`: fuerza Node 20.19 y `npm install` en lugar de `npm ci`.
- `.npmrc`: desactiva auditoría/fund y usa legacy peer deps para evitar conflictos de instalación.
- `package-lock.json`: regenerado con npm 10.

En Railway:
- Builder: Railpack
- Root Directory: vacío, si este repositorio contiene directamente `package.json`, `angular.json` y `src/`.
- Start Command: dejar vacío o `npm start`.

Para subir:

```bash
git add .
git commit -m "fix: frontend railpack npm install stable"
git push origin main --force
```
