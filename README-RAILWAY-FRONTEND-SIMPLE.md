# Frontend Railway simple

Este frontend está preparado para Railway sin Dockerfile, sin pnpm, sin package-lock.json y sin railpack.json.

Railway debería ejecutar automáticamente:

```bash
npm install
npm run build
npm start
```

En Railway:

- Builder: Railpack
- Root Directory: vacío, siempre que `package.json`, `angular.json` y `src/` estén en la raíz del repositorio frontend.

Para subir:

```bash
git init
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/RicardoToledoB/gestionpresupuestaria-frontend.git

git add .
git commit -m "feat: solicitud ceropapel buscable en ordenes de compra" || true
git push origin main --force
```
