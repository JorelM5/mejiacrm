# CRM Mejía

CRM sencillo para manejar clientes y proyectos (Imprenta, PhotoBooth, Foto y Video, Web, Redes Sociales, Vinyl, Otro), con calendario para detectar fechas empalmadas. Funciona en el celular y en la computadora, sin instalar nada — es una página web estática.

## Cómo funciona el almacenamiento

**No tiene servidor ni base de datos.** Todo se guarda en el navegador del dispositivo (localStorage). Por eso:

- Los datos que captures en tu celular **no aparecen automáticamente** en tu laptop.
- Usa el botón **Respaldo** (arriba a la derecha) para:
  - **Exportar**: descarga un archivo `.json` con todos tus clientes y proyectos. Mándatelo por WhatsApp, correo o súbelo a Google Drive.
  - **Importar**: en el otro dispositivo, abre Respaldo → elige ese archivo `.json`. Esto reemplaza los datos del dispositivo con los del respaldo, así que exporta primero si quieres conservar lo que ya tenías ahí.

Recomendación: al final del día, desde tu celular, exporta el respaldo y súbelo a Drive o mándatelo a ti mismo. En la laptop lo importas y quedas sincronizado.

## Publicarlo (GitHub + Netlify)

1. **Sube esta carpeta a GitHub**
   ```bash
   cd crm-mejia
   git init
   git add .
   git commit -m "CRM Mejía"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/crm-mejia.git
   git push -u origin main
   ```

2. **Conecta con Netlify**
   - Entra a [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
   - Elige tu repositorio de GitHub `crm-mejia`.
   - Build command: (déjalo vacío)
   - Publish directory: `.` (ya viene configurado en `netlify.toml`)
   - Clic en **Deploy**.

3. Netlify te da una URL tipo `https://crm-mejia-xxxx.netlify.app`. Ábrela en tu celular y en tu laptop, y agrégala a tu pantalla de inicio en el celular (Safari/Chrome → Compartir → "Agregar a pantalla de inicio") para que se sienta como una app.

Cada vez que quieras actualizar el CRM (cambios de diseño, etc.), simplemente haz `git push` de nuevo — Netlify vuelve a publicar solo.

## Qué incluye

- **Clientes**: nombre, teléfono, correo, dirección y notas. Buscador en la parte superior.
- **Proyectos por cliente**: título, categoría, fecha de inicio/fin, notas y estado (activo/terminado). Los proyectos terminados se ocultan automáticamente; hay un switch para volver a mostrarlos.
- **Editar / Borrar**: cada cliente y cada proyecto tiene sus botones de editar y borrar, con confirmación antes de eliminar.
- **Calendario**: vista mensual con los proyectos activos coloreados por categoría. Si dos proyectos activos comparten fecha, el día se marca en rojo y aparece un listado abajo con el detalle del choque de fechas.

## Estructura de archivos

```
crm-mejia/
├── index.html          → estructura de la página
├── css/style.css        → estilos
├── js/app.js             → toda la lógica (clientes, proyectos, calendario, respaldo)
└── netlify.toml          → configuración de despliegue
```

No requiere `npm install` ni build: es HTML/CSS/JS puro.
