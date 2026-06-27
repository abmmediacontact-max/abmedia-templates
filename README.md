# ABMedia · Story Builder

Generador web de **secuencias de stories** (formato 9:16, 1080×1920) con
plantillas predefinidas, **selección aleatoria de imágenes** de una carpeta que
subes y **textos editables**. Inspirado en un panel tipo *Production desk*, con
los tonos naranjas de ABMedia.

Todo funciona **100% en el navegador**: las imágenes que subes **no se envían a
ningún servidor**, se procesan en tu propio dispositivo.

---

## ✨ Qué hace

- **Panel "Production desk":** bandeja de ideas pendientes + pipeline de
  secuencias con estados (Borrador / En progreso / Programado / Publicado).
- **Plantillas de secuencia:** Oferta/Promo, Testimonio, Tips, Minimalista.
- **Imágenes aleatorias:** subes una carpeta y cada frame coge una imagen al
  azar. Botones para *barajar todas* o *cambiar una sola*.
- **Textos editables:** cada frame tiene sus campos de texto ajustables en vivo.
- **Personalización:** color de marca (naranja ABMedia por defecto) y tipografía.
- **Exportación:** descarga un frame o toda la secuencia en JPG listos para subir.

---

## 🚀 Cómo usarlo

1. Abre `index.html` en el navegador (doble clic) o súbelo a tu web.
2. Pulsa **"Subir imágenes"** y elige una carpeta de fotos.
3. Crea una secuencia desde la bandeja (**Crear secuencia**) o con **Nueva secuencia**.
4. Ajusta los textos, baraja imágenes y elige color/tipografía.
5. **Descarga** los frames y súbelos a tus stories.

---

## 🌐 Cómo subirlo a ABMedia.es

Son solo 4 archivos estáticos (`index.html`, `styles.css`, `app.js`,
`templates.js`). No necesita base de datos ni servidor de aplicación.

**Opción A · Tu hosting actual (recomendada, coste 0 €)**
Sube los 4 archivos por FTP/Administrador de archivos a una carpeta, p. ej.
`/stories`, y quedará disponible en `https://abmedia.es/stories`.

**Opción B · Subdominio bonito**
Crea un subdominio (gratis en la mayoría de hostings) como
`https://stories.abmedia.es` y sube ahí los archivos.

**Opción C · Hosting gratuito externo**
Despliega gratis en Netlify, Vercel o Cloudflare Pages (arrastrar y soltar la
carpeta) sin tocar tu hosting actual.

> Nota: las tipografías se cargan desde Google Fonts (requiere conexión). Si
> quieres que funcione 100% sin internet, se pueden incrustar las fuentes.

---

## 💶 Coste

| Concepto      | Coste |
|---------------|-------|
| Software      | 0 € (este proyecto) |
| Hosting       | 0 € (estático, cabe en tu hosting o en uno gratuito) |
| Mantenimiento | Prácticamente nulo |

**Total: 0 € adicionales** para una versión funcional.

---

## 🛠️ Personalización rápida

- **Plantillas:** edita `templates.js` para cambiar textos por defecto,
  posiciones, tamaños o añadir secuencias nuevas.
- **Color de marca:** se cambia desde la propia app, o el valor por defecto en
  `app.js` (`accent: "#ff6a1a"`).
- **Formato:** está fijado a 1080×1920 (9:16). Se puede ampliar a 1:1 o 4:5
  cambiando `CANVAS_W` / `CANVAS_H` en `templates.js`.

## 🔒 Privacidad

Las imágenes nunca salen del dispositivo: se cargan en memoria y se renderizan
con `<canvas>`. No hay subida a servidores ni almacenamiento externo.
