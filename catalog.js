/*
 * Catálogo de secuencias ABMedia.
 * Cada slide usa el modelo de párrafos con marcas inline editables:
 *   ==resaltado==   __subrayado__   **acento**
 *
 * Las secuencias están organizadas en 3 categorías de uso:
 *   personal — Cercanía / lifestyle
 *   venta    — Vender / oferta / lanzamiento
 *   puente   — Lead magnets / piezas que llevan a CTA
 */

const CATEGORIES = {
            personal: {
                              name: "Personal",
                              icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 16 7.5 14 12 14 S20 16 20 21 Z"/></svg>',
                              desc: "Cercanía y lifestyle. Conectar contando tu día a día.",
                              color: "#ff6a1a"
            },
            venta: {
                              name: "Venta",
                              icon: '<svg viewBox="0 0 24 24"><path d="M3 13 L11 21 L21 11 V3 H13 Z"/><circle cx="16.5" cy="7.5" r="1.6" fill="#0c0a09"/></svg>',
                              desc: "Vender, abrir cupos y empujar a la compra.",
                              color: "#ff6a1a"
            },
            puente: {
                              name: "Puente",
                              icon: '<svg viewBox="0 0 24 24"><path d="M2 17 H22 V19 H2 Z"/><path d="M4 17 V11 C4 8 7 6 12 6 S20 8 20 11 V17 H17 V12 H7 V17 Z"/><path d="M4 13 H20 V14 H4 Z"/></svg>',
                              desc: "Lead magnets y stories que llevan a CTA.",
                              color: "#ff6a1a"
            },
            flex: {
                              name: "Flex",
                              icon: '<svg viewBox="0 0 24 24"><path d="M12 2 L14.5 8.5 L21 9.5 L16 14 L17.5 20.5 L12 17 L6.5 20.5 L8 14 L3 9.5 L9.5 8.5 Z"/></svg>',
                              desc: "Mostrar resultados y logros sin vender directamente.",
                              color: "#ff6a1a"
            },
            valor: {
                              name: "Valor",
                              icon: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 9 L12 22 L4 9 Z"/><path d="M4 9 H20 M8 9 L12 2 L16 9 M8 9 L12 22 M16 9 L12 22"/></svg>',
                              desc: "Aportar valor real con tips y reflexiones útiles.",
                              color: "#ff6a1a"
            }
};

const CATALOG = [
            /* =========================== PERSONAL =========================== */
        {
                        id: "p-finde", category: "personal", title: "Fin de Semana",
                        objective: "Mostrar tu fin de semana y conectar con tu audiencia.",
                        slides: [
                                { overlay: "bottom", body: "Esto me hace conseguir ==[resultado soñado]== más que cualquier cosa…" },
                                { overlay: "bottom", body: "Están siendo días de [situación] y hacer __[actividad]__ me ayuda a recargar las pilas." },
                                { overlay: "bottom", body: "**Explica sobre la actividad / anécdota**\n\nUna foto + una frase corta y honesta." }
                                              ]
        },
        {
                        id: "p-nosabeis", category: "personal", title: "No sabéis lo que…",
                        objective: "Generar curiosidad sobre algo que has hecho.",
                        slides: [
                                { overlay: "bottom", body: "No sabéis lo que ==[actividad pasada]== [fecha concreta].\n\nPista: __no tiene nada que ver__ con [tu sector]." },
                                { overlay: "bottom", body: "Comenta la actividad que hiciste, **sin entrar en detalle**." },
                                { overlay: "bottom", body: "Trabajar duro está bien…\n\nPero __vivir es mejor que trabajar__.\n\nTener tiempo y estabilidad económica para disfrutar momentos así…\n\n==Todo gracias a [tu sector]==." }
                                              ]
        },

        {
                        id: "p-mision", category: "personal", title: "Mi misión",
                        objective: "Conectar mostrando tu propósito y abrir conversación en DM.",
                        slides: [
                                { overlay: "bottom", body: "Mi misión es ayudarte a ==(*conseguir resultado*)==\n\n**Responde:** ¿Qué te está limitando ahora mismo para conseguir __(*resultado deseado*)__?" }
                                              ]
        },
        {
                        id: "p-hottake", category: "personal", title: "Opinión polémica",
                        objective: "Generar conversación con una opinión fuerte sobre tu sector. Añade una caja de respuestas debajo.",
                        slides: [
                                { overlay: "bottom", body: "(*Tu opinión impopular sobre tu sector*) 🔥\n\n**¿Qué opinas de esto?**" }
                                              ]
        },
        {
                        id: "p-vistaincreible", category: "personal", title: "Vista increíble",
                        objective: "Mostrar un momento de disfrute que refleje tu estilo de vida. Añade una foto de una vista increíble de un viaje reciente.",
                        slides: [
                                { overlay: "bottom", body: "==Qué locura despertarme con estas vistas==\n\nY pensar que todo esto empezó cuando, con (*X años*), __perdía dinero en (*tu primer negocio/actividad*)__ 😅" }
                                              ]
        },
        {
                        id: "p-ultimahora", category: "personal", title: "Última hora",
                        objective: "Comentar una novedad del sector y generar debate con una encuesta. Usa la misma imagen en las dos slides.",
                        slides: [
                                { overlay: "bottom", body: "(*Cuenta aquí qué está pasando: la noticia o tendencia de tu sector*) 📰" },
                                { overlay: "bottom", body: "(*Tu pregunta sobre la noticia*)\n\n**Encuesta:** (*Opción 1*) / (*Opción 2*)" }
                                              ]
        },
        {
                        id: "p-mentores", category: "personal", title: "Por qué importan los mentores",
                        objective: "Compartir una lección aprendida de un mentor de forma cercana. Haz una captura de una conversación con uno de tus mentores.",
                        slides: [
                                { overlay: "bottom", body: "Estaba haciendo lo que creía que era correcto…\n\nY hacer \"lo correcto\" __me estaba alejando de (*resultado*)__\n\nAhora estoy ==mejor que nunca==\n\nEspero que esto le sirva a alguien" }
                                              ]
        },
        {
                        id: "p-historiavida", category: "personal", title: "Mi historia",
                        objective: "Mostrar tu evolución personal a través de varias fotos, del inicio a hoy. Slide 1: foto tuya de tus comienzos. Slide 2: foto de un momento difícil o de bajón. Slide 3: foto del punto de inflexión o primer resultado. Slide 4: foto tuya actual.",
                        slides: [
                                { overlay: "bottom", body: "Así empezaba yo (*hace X años*), sin tener ni idea de (*tu sector*)" },
                                { overlay: "bottom", body: "Hubo un momento en el que ==casi lo dejo==…\n\n(*Cuenta brevemente qué pasó*)" },
                                { overlay: "bottom", body: "Y entonces pasó (*el punto de inflexión o primer resultado*)" },
                                { overlay: "bottom", body: "Hoy __(*resultado actual*)__.\n\nSi yo pude, tú también puedes." }
                                              ]
        },
        {
                        id: "p-diaperfecto", category: "personal", title: "Mi día perfecto",
                        objective: "Compartir 4 fotos que representen tu día o fin de semana perfecto, para conectar con tu estilo de vida ideal.",
                        slides: [
                                { overlay: "bottom", body: "==Mi día perfecto empieza así==" },
                                { overlay: "bottom", body: "(*Momento 2 de tu día ideal*)" },
                                { overlay: "bottom", body: "(*Momento 3 de tu día ideal*)" },
                                { overlay: "bottom", body: "Y termina con __(*momento 4 de tu día ideal*)__ 🤍" }
                                              ]
        },
        {
                        id: "p-fraselibro", category: "personal", title: "Frase de libro",
                        objective: "Compartir una frase de un libro que te haya marcado y aplicarla a tu vida. Slide 1: foto de la página o frase del libro. Slide 2: tú explicando por qué te ha marcado.",
                        slides: [
                                { overlay: "bottom", body: "(*Frase del libro que te ha marcado*)" },
                                { overlay: "bottom", body: "La leí en un momento en el que ==(*tu situación en ese momento*)==\n\nY desde entonces __(*cómo la aplicas*)__" }
                                              ]
        },
        {
                        id: "p-vistaavion", category: "personal", title: "Vista desde el avión",
                        objective: "Compartir un momento de viaje real y generar conversación con una encuesta. Foto tomada desde la ventanilla del avión. Añade la ubicación a la story si puedes.",
                        slides: [
                                { overlay: "bottom", body: "==¿Cuenta como haber estado en un sitio nuevo si solo lo he sobrevolado?==\n\n**Encuesta:** Sí / No" }
                                              ]
        },
        {
                        id: "p-puntuami", category: "personal", title: "Puntúa mi…",
                        objective: "Mostrar tu espacio de trabajo o casa y generar interacción con un elemento de puntuación (barra/emoji slider del 1 al 10). Foto de tu espacio de trabajo o casa.",
                        slides: [
                                { overlay: "bottom", body: "==Puntúa mi (*espacio de trabajo / salón / escritorio*)==\n\n__Del 1 al 10__" }
                                              ]
        },
        {
                        id: "p-micapricho", category: "personal", title: "Mi capricho",
                        objective: "Compartir algo en lo que gastas más que la media para conectar de forma cercana. Añade una foto de tu última compra relacionada con ese capricho.",
                        slides: [
                                { overlay: "bottom", body: "¿En qué gastas ==mucho más dinero== que la persona media?\n\nPara mí es (*tu afición o gasto favorito*) 😅" }
                                              ]
        },

            /* ============================ VENTA ============================ */
        {
                        id: "v-objetivos", category: "venta", title: "Objetivos 2026",
                        objective: "Cerrar año y abrir oferta para el año nuevo.",
                        slides: [
                                { overlay: "bottom", body: "Si ==[cliente ideal]==…\n\nAtento ➡️" },
                                { overlay: "full", body: "El año pasado, conseguí __[logro]__.\n\nEste año, quiero ==[nueva meta / objetivo]==." },
                                { overlay: "bottom", body: "Si quieres conseguir [objetivo soñado]\n\n**Responde \"PALABRA CLAVE\"** y te lo cuento." }
                                              ]
        },
        {
                        id: "v-siclienteideal", category: "venta", title: "Si [cliente ideal]…",
                        objective: "Atrapar la atención del cliente ideal y vender.",
                        slides: [
                                { overlay: "bottom", body: "Si ==[cliente ideal]==…\n\nAtento ➡️" },
                                { overlay: "full", body: "Muchos [cliente ideal] están dejando pasar __[resultado soñado]__ por no hacer esto:\n\n**\"[el sistema] →\"**" },
                                { overlay: "bottom", body: "Si tienes [cliente ideal] y quieres ==[objetivo soñado]==\n\n**Responde \"PALABRA CLAVE\"** y te explico cómo hacerlo." }
                                              ]
        },
        {
                        id: "v-mehedespertado", category: "venta", title: "Me he despertado así…",
                        objective: "Mensaje + autoridad + sistema + CTA hacia tu VSL.",
                        slides: [
                                { overlay: "full", body: "\"Todas las mañanas me despierto con esto 👇\"\n\n❌ No [método común 1]\n❌ No [método común 2]\n\n✅ Solo ==[tu método]==.\n\n**ASÍ FUNCIONA →**" },
                                { overlay: "full", body: "En los últimos [X] años, no he hecho más que dominar __[método o habilidad]__ que [consigue resultado].\n\nHay ==[X] sistemas== que me han permitido replicar estos resultados.\n\n**LOS [X] SISTEMAS →**" },
                                { overlay: "full", body: "1: __[Nombre 1ª parte]__\n2: __[Nombre 2ª parte]__\n3: __[Nombre 3ª parte]__\n4: __[Nombre 4ª parte]__\n\n**Cómo conseguir estos Sistemas →**" },
                                { overlay: "bottom", body: "He creado un vídeo de [X] minutos explicando cómo implementar estos sistemas ==en tu negocio==.\n\n**Responde \"PALABRA CLAVE\"** y te lo envío." }
                                              ]
        },
        {
                        id: "v-comoes", category: "venta", title: "Cómo es…",
                        objective: "Mostrar prueba social con testimonios + CTA.",
                        slides: [
                                { overlay: "bottom", body: "Oye [tu nombre / apodo], ==¿qué se siente trabajar dentro de [nombre de tu empresa]?==" },
                                { overlay: "soft", body: "Testimonio 1 / resultado de cliente.\n\n__Mantén el mismo encabezado en todas.__" },
                                { overlay: "soft", body: "Testimonio 2 / resultado de cliente." },
                                { overlay: "soft", body: "Testimonio 3 / resultado de cliente." },
                                { overlay: "soft", body: "Testimonio 4 / resultado de cliente." },
                                { overlay: "bottom", body: "Responde **[keyword]** para más info." }
                                              ]
        },
        {
                        id: "v-ampliacion", category: "venta", title: "Ampliación de cupos",
                        objective: "Abrir cupos / lista de espera y empujar a inscribirse.",
                        slides: [
                                { overlay: "bottom", body: "Estamos abriendo nuestra ==lista de espera== para [tu oferta].\n\nAmpliamos el límite de miembros de **[X–Y]**.\n\nSi te interesa:\n• __[Característica 1]__\n• __[Característica 2]__\n• __[Característica 3]__\n\n**Responde \"PALABRA CLAVE\"** para más info." }
                                              ]
        },

        {
                        id: "v-buenaymejor",
                        category: "venta",
                        title: "Buena y Mejor Noticia",
                        objective: "Generar expectación por el lanzamiento de un programa/oferta nueva y conseguir respuestas por DM.",
                        slides: [
                                {
                                                            overlay: "soft",
                                                            body: "==BUENAS NOTICIAS==\n(explica por qué la persona que te ve está ahora mismo en una posición perfecta para tener éxito, según sus circunstancias)\n\n==MEJORES NOTICIAS==\nVoy a lanzar **[programa]** en **[mes]** si quieres ser de los primeros en enterarte de cuándo estará disponible (y conseguir el mejor precio…)\n\nRESPONDE __\"palabra\"__"
                                }
                                              ]
        },
        {
                        id: "v-tweetpitch", category: "venta", title: "Pitch estilo Tweet",
                        objective: "Presentar una oferta \"hecha por ti\" imitando el formato de un tuit.",
                        slides: [
                                { overlay: "full", body: "Si quieres ==(*conseguir más resultados*)==...\n\nTengo **(*X* plazas)** abiertas para (*avatar*) que quiera (*resultado medible*) usando (*método*) en (*tiempo corto*)\n\n→ Yo __(*hago acción importante 1*)__\n→ Yo __(*hago acción importante 2*)__\n→ Me encargo de todo\n\nTú solo te sientas a ver cómo (*pasan los resultados*)\n\n**Responde \"PALABRA\"** si quieres más (*resultados*)" }
                                              ]
        },
        {
                        id: "v-nuncamas", category: "venta", title: "Nunca más",
                        objective: "Anunciar una subida de precios apoyándote en resultados recientes de clientes. Añade una captura del resultado/testimonio del cliente.",
                        slides: [
                                { overlay: "full", body: "Hace (*X* meses) os dije que no íbamos a hacer más rebajas, y lo decía en serio.\n\nAcabamos de ayudar a otro (*avatar*) a ==(*conseguir resultado deseado*)==. Vamos a subir precios para reflejar los resultados que estamos dando.\n\nSi quieres entrar al precio actual, **toca aquí**\n\n**Encuesta:** \"Quiero info\" / \"Cuéntame más\" / \"Ya soy tu cliente\"" }
                                              ]
        },
        {
                        id: "v-facilcuandosabes", category: "venta", title: "Es fácil cuando sabes cómo",
                        objective: "Apoyarte en un testimonio de cliente para generar contactos por DM. Añade el testimonio del cliente destacando su resultado.",
                        slides: [
                                { overlay: "full", body: "Esto es súper fácil cuando sabes cómo hacerlo\n\n==(*resultado del cliente*)==\n\n¿Quieres ayuda para __(*conseguir un resultado similar*)__ y dejar de __(*cometer el error típico*)__?\n\n**Escríbeme \"(*PALABRA*)\"**" }
                                              ]
        },
        {
                        id: "v-frasefuerte", category: "venta", title: "Frase Fuerte",
                        objective: "Posicionarte con autoridad y lanzar una llamada a la acción directa.",
                        slides: [
                                { overlay: "full", body: "Para (*avatar de cliente*)\n\nSiguiente ➡️" },
                                { overlay: "full", body: "El año pasado, ==(*la empresa consiguió un resultado concreto*)==\n\nEste año quiero __multiplicarlo__.\n\nSi quieres acceder a (*resultado de tu solución*)\n\n**Responde \"PALABRA\"** para aplicar y trabajar conmigo aquí" }
                                              ]
        },
        {
                        id: "v-reaperturacupos", category: "venta", title: "Reapertura de cupos",
                        objective: "Anunciar la reapertura de tu programa/oferta con fecha concreta y lista de lo que incluye, y cerrar con una CTA por DM.",
                        slides: [
                                { overlay: "full", body: "==(*Tu programa*) vuelve a abrir el (*fecha*)== 🚨\n\n• __(*Qué incluye 1*)__\n• __(*Qué incluye 2*)__\n• __(*Qué incluye 3*)__\n\nPlazas limitadas." },
                                { overlay: "bottom", body: "**Responde \"(*PALABRA*)\"** y te mando toda la info + el enlace para apuntarte." }
                                              ]
        },
        {
                        id: "v-prosycons", category: "venta", title: "Pros y Contras",
                        objective: "Vender mostrando primero el resultado deseado, luego explicando cómo se consigue, y cerrando con una comparativa honesta de pros y contras.",
                        slides: [
                                { overlay: "full", body: "Si estás empezando ==(*desde cero*)==, escucha esto" },
                                { overlay: "full", body: "Imagina __(*conseguir tal resultado*)__ en (*poco tiempo*)\n\n✅ (*Beneficio 1*)\n✅ (*Beneficio 2*)\n✅ (*Beneficio 3*)\n\n¿Cómo te sentirías?" },
                                { overlay: "full", body: "(*Explica brevemente cómo es posible conseguirlo*)" },
                                { overlay: "full", body: "**Pros:**\n✅ (*Pro 1*)\n✅ (*Pro 2*)\n✅ (*Pro 3*)\n\n**Contras:**\n⚠️ (*Contra 1*)\n⚠️ (*Contra 2*)" }
                                              ]
        },
        {
                        id: "v-recapresultados", category: "venta", title: "Recopilatorio de resultados",
                        objective: "Cerrar el año/mes mostrando varios resultados de clientes en formato recopilatorio. Añade capturas de resultados reales de clientes en cada slide.",
                        slides: [
                                { overlay: "soft", body: "==Recopilatorio de resultados== de (*mes/año*) 📊" },
                                { overlay: "soft", body: "(*Resultado de cliente 1*)" },
                                { overlay: "soft", body: "(*Resultado de cliente 2*)" },
                                { overlay: "soft", body: "(*Resultado de cliente 3*)" },
                                { overlay: "bottom", body: "Si quieres ser el próximo, **responde \"(*PALABRA*)\"**" }
                                              ]
        },
        {
                        id: "v-recordatorio", category: "venta", title: "Recordatorio amistoso",
                        objective: "Recordar a tu audiencia el valor de no hacerlo todo solos, apoyándote en tu propio progreso. Añade imágenes que muestren tu evolución (antes/después).",
                        slides: [
                                { overlay: "full", body: "**Recordatorio amistoso**\n\nTardé años en ==(*conseguir tu resultado*)== porque intenté hacerlo todo yo solo/a." },
                                { overlay: "bottom", body: "No cometas mi error.\n\n**Escríbeme \"(*PALABRA*)\"**" }
                                              ]
        },
        {
                        id: "v-empiezaconventaja", category: "venta", title: "Empieza el año con ventaja",
                        objective: "Generar expectación de cierre/inicio de año contrastando a quienes esperan al último momento con quienes ya actuaron, apoyándote en resultados de clientes.",
                        slides: [
                                { overlay: "full", body: "Cada año, por estas fechas… ==la gente empieza a flojear==.\n\n(*El trabajo / la vida*) se complica, las rutinas se rompen. Y llega el momento en el que todo el mundo corre a empezar de cero… otra vez." },
                                { overlay: "soft", body: "Aquí tienes a __(*X personas*)__ que no esperaron al momento perfecto…\n\n(*3-4 resultados de clientes*)\n\nEmpezaron, fueron constantes… y consiguieron lo que querían." },
                                { overlay: "bottom", body: "Si quieres empezar ==ya por delante==… sin volver a empezar de cero…\n\n**Responde \"(*PALABRA*)\"** y te cuento cómo puedo ayudarte." }
                                              ]
        },
        {
                        id: "v-juguemos", category: "venta", title: "Juguemos a un juego",
                        objective: "Generar interacción con una encuesta tipo \"adivina el resultado\" antes de revelar la transformación de un cliente. Repite el mismo formato con 1-2 resultados más si quieres alargar la secuencia.",
                        slides: [
                                { overlay: "full", body: "==Juguemos a un juego== 👉" },
                                { overlay: "soft", body: "(*Antes y después de la transformación de un cliente*)\n\n¿__Cuánto tiempo__ tardó en conseguirlo?\n\n**Encuesta:** (*Opción correcta*) / (*Opción incorrecta 1*) / (*Opción incorrecta 2*)" },
                                { overlay: "soft", body: "==(*Resultado*) en (*el tiempo real*)==\n\n✅ (*Beneficio 1*)\n✅ (*Beneficio 2*)\n✅ (*Beneficio 3*)" }
                                              ]
        },

            /* ============================ PUENTE ============================ */
        {
                        id: "pu-netflix", category: "puente", title: "Netflix",
                        objective: "Comparar tu lead magnet con Netflix para destacar el valor.",
                        slides: [
                                { overlay: "bottom", body: "==Esto es Netflix==." },
                                { overlay: "bottom", body: "Y este es mi __[sistema / metodología]__ que [resultado obtenido]." },
                                { overlay: "full", body: "❌ Coste: $20\n❌ Ofrece: Diversión\n❌ Valor: Perder tiempo\n\n✅ Coste: ==Gratis==\n✅ Ofrece: [Resultado soñado]\n✅ Valor: [Resultados / coste]\n\n**Responde \"PALABRA CLAVE\"** para tener [sistema]." }
                                              ]
        },
        {
                        id: "pu-webinar", category: "puente", title: "Webinar / Directo",
                        objective: "Anunciar un directo gratuito y captar registros.",
                        slides: [
                                { overlay: "bottom", body: "No consigues ==[Resultado soñado]==.\n\nEnumera 2 cosas que se suelen hacer y __una tercera__ que no consiga el resultado.\n\nPor eso [fecha / tiempo] voy a dar una **mentoría en directo GRATIS** 👉🏻" },
                                { overlay: "bottom", body: "En esta mentoría veremos:\n\n• __Punto de dolor 1__\n• __Punto de dolor 2__\n• __[Sistema / metodología]__\n\nSi quieres acceso **responde \"PALABRA CLAVE\"** y te mando el link." }
                                              ]
        },
        {
                        id: "pu-estrategia", category: "puente", title: "¿Quieres la estrategia completa?",
                        objective: "Validar interés (encuesta) y entregar lead magnet por DM.",
                        slides: [
                                { overlay: "bottom", body: "¿Quieres el ==[lead magnet]== completo que me consigue [resultado cuantificable]?\n\n**Encuesta: Sí / No**" },
                                { overlay: "bottom", body: "He creado un __[recurso] detallado__ que explica la estrategia exacta que utilizo." },
                                { overlay: "bottom", body: "**Responde \"PALABRA CLAVE\"** para acceder a él." }
                                              ]
        },

        {
                        id: "pu-meme", category: "puente", title: "Meme",
                        objective: "Usar un meme relatable para conectar y guiar hacia una CTA. Añade un meme que refleje una lucha con la que tu audiencia se sienta identificada.",
                        slides: [
                                { overlay: "full", body: "" },
                                { overlay: "bottom", body: "(*Tu explicación del meme, con tus propias palabras*)" },
                                { overlay: "bottom", body: "¿Y si pudieras tener ==(*resultado deseado*)==?" },
                                { overlay: "bottom", body: "Es hora de dejar de __(*quedarte estancado*)__...\n\n**Escríbeme \"palabra\"** para ver mi (*vídeo sobre cómo consigo resultados*)" }
                                              ]
        },
        {
                        id: "pu-carpeta", category: "puente", title: "En esta carpeta",
                        objective: "Regalar un recurso mostrando una captura de carpeta como gancho visual. Captura de pantalla de una carpeta de Mac titulada con un nombre que indique valor.",
                        slides: [
                                { overlay: "bottom", body: "En esta carpeta está ==(*el lead magnet o recurso que vas a regalar*)== y te lo voy a dar __gratis__\n\nSolo **responde a esta story** y te lo mando." }
                                              ]
        },
        {
                        id: "pu-reciencreado", category: "puente", title: "Recién creado",
                        objective: "Anunciar un recurso gratuito actualizado y captar respuestas por DM. Foto tuya señalando una captura de tu lead magnet.",
                        slides: [
                                { overlay: "bottom", body: "Acabo de crear este ==(*recurso gratuito*) actualizado para 2027==\n\n• (*Elemento 1*)\n• (*Elemento 2*)\n• (*Elemento 3*)\n\n**Desliza hacia arriba con \"palabra\"** y te mando el (*recurso*)" }
                                              ]
        },
        {
                        id: "pu-essencillo", category: "puente", title: "Así de simple",
                        objective: "Mostrar un resultado y explicar lo fácil que es conseguirlo. Foto tuya señalando hacia arriba + captura de un resultado propio o de un cliente.",
                        slides: [
                                { overlay: "bottom", body: "Esta es la forma más fácil de ==(*conseguir el resultado deseado*)== solo con __(*una acción sencilla*)__\n\nEs así de simple\n\n**(*enlace al recurso o tutorial*)**" }
                                              ]
        },
        {
                        id: "pu-procesoactual", category: "puente", title: "¿Proceso actual?",
                        objective: "Validar interés con una encuesta y entregar un recurso gratuito relacionado. Foto que dé contexto al tema. Slide 2: muestra resultados de clientes que usaron este proceso. Slide 3: imagen del recurso gratuito (tipo miniatura de YouTube).",
                        slides: [
                                { overlay: "bottom", body: "¿==(*Usas tal elemento*)== para (*proceso*)?\n\n**Encuesta:** Sí / No" },
                                { overlay: "bottom", body: "La verdad es que nuestros clientes con __mejores resultados__ usan (*proceso*) para (*conseguir resultado*)\n\nEsto es clave para (*avatar*), sobre todo cuando (*das el siguiente paso*)" },
                                { overlay: "bottom", body: "He creado ==(*recurso*)== donde (*explico el tema del lead magnet o vídeo + beneficios*)\n\n**Responde \"palabra\"** para acceder" }
                                              ]
        },
        {
                        id: "pu-casodeexito", category: "puente", title: "Caso de éxito",
                        objective: "Mostrar un caso de éxito real y desglosar qué hicisteis para conseguirlo. Slide 1: captura o foto que demuestre el resultado del cliente (cuanto menos producida, mejor). Slide 2: tú explicando el proceso.",
                        slides: [
                                { overlay: "bottom", body: "(*Nombre del cliente*) pasó de ==(*resultado anterior*)== a ==(*resultado actual*)== en (*plazo de tiempo*)" },
                                { overlay: "bottom", body: "Esto es lo que cambiamos en su (*proceso/estrategia*):\n\n1. (*Cambio 1*)\n2. (*Cambio 2*)\n3. (*Cambio 3*)" }
                                              ]
        },
        {
                        id: "pu-anosconsistencia", category: "puente", title: "Hace 1, 2 y 3 años",
                        objective: "Mostrar consistencia y autoridad comparando resultados o estrategia a lo largo de varios años. Usa capturas antiguas si las tienes para cada slide.",
                        slides: [
                                { overlay: "bottom", body: "==Conseguir (*resultado*)== no es tan difícil como piensas" },
                                { overlay: "bottom", body: "Estoy usando __la misma estrategia__ con la que conseguí (*resultado*) hace (*1 año*)" },
                                { overlay: "bottom", body: "Y la misma que usé hace (*2-3 años*) para (*otro resultado*)\n\n==Lo que funciona, funciona==" }
                                              ]
        },
        {
                        id: "pu-guiarapida", category: "puente", title: "Guía rápida",
                        objective: "Entregar valor rápido en formato de mini-guía y usarlo como puente hacia tu oferta u otro contenido.",
                        slides: [
                                { overlay: "full", body: "Cómo ==(*conseguir resultado deseado*)==" },
                                { overlay: "full", body: "(*Número*) tips prácticos de alguien que __(*lleva X tiempo/ha conseguido Y en tu sector*)__:\n\n1. (*Tip 1*)\n2. (*Tip 2*)\n3. (*Tip 3*)" }
                                              ]
        },
        {
                        id: "pu-suelolabomba", category: "puente", title: "Suelto la bomba",
                        objective: "Contar el único cambio que te dio resultados y entregar un recurso gratuito a cambio de una palabra clave. Usa un vídeo o foto con texto tipo \"toca para continuar\" en el primer slide.",
                        slides: [
                                { overlay: "full", body: "==Lo único que cambié para (*conseguir tal resultado*)==\n\nFue dejar de __(*hacer la táctica común*)__\n\nToca 👉" },
                                { overlay: "bottom", body: "Y (*hacer la acción alternativa*)\n\nTranquilo, no te voy a soltar la bomba y dejarte tirado…\n\n**Responde \"(*PALABRA*)\"** y te mando (*el recurso*)" }
                                              ]
        },
        {
                        id: "pu-avisoherramienta", category: "puente", title: "Aviso sobre una herramienta",
                        objective: "Compartir lo poco que se aprovecha una herramienta común en tu sector y regalar un recurso para sacarle todo el partido. Foto tuya (cara visible).",
                        slides: [
                                { overlay: "full", body: "**PSA**\n\nLa mayoría solo usa 1/10 de lo que (*herramienta común*) puede hacer: automatizaciones básicas y poco más.\n\nPero cuando aprendes el 90% que nadie usa… ==de verdad cambia tu negocio==.\n\nHe conseguido __(*resultado usando la herramienta*)__.\n\nPreparé (*un recurso*) para que pases de usarla a medias a sacarle todo el partido en menos de (*X minutos*).\n\n**Responde \"(*PALABRA*)\"** y te lo mando." }
                                              ]
        },
        {
                        id: "pu-solucionnofunciona", category: "puente", title: "La solución típica no funciona",
                        objective: "Cuestionar las soluciones típicas de tu nicho y usarlo como gancho para captar suscriptores a una lista exclusiva. Selfie o foto tuya.",
                        slides: [
                                { overlay: "full", body: "La mayoría de ==(*soluciones típicas*)== NO FUNCIONAN.\n\nSi quieres (*el resultado que ofrece tu solución*), estoy abriendo una lista exclusiva donde mando (*cantidad*) (*frecuencia*).\n\n**Responde \"(*PALABRA*)\"** para apuntarte." }
                                              ]
        },

            /* ============================= FLEX ============================= */
        {
                        id: "f-tehasunido", category: "flex", title: "POV: Te uniste",
                        objective: "Mostrar prueba social en formato POV con testimonios de clientes. Añade captura del testimonio + foto tuya señalando hacia arriba. Repite este formato 2-3 veces más con distintos testimonios de clientes.",
                        slides: [
                                { overlay: "full", body: "POV: Te uniste a ==(*tu oferta*)== 👇" },
                                { overlay: "full", body: "POV: Te uniste a ==(*tu oferta*)== 👇" }
                                              ]
        },
        {
                        id: "f-capturaresultados", category: "flex", title: "Captura de resultados",
                        objective: "Mostrar resultados cuantificables sin venderlos directamente. Haz una captura de algún tipo de seguimiento de resultados que tengas (ingresos/ventas, visualizaciones, peso perdido, crecimiento de tu portfolio, etc).",
                        slides: [
                                { overlay: "full", body: "Así van mis ==(*resultados*)== este mes 📈" }
                                              ]
        },
        {
                        id: "f-agendahoy", category: "flex", title: "Agenda de hoy",
                        objective: "Mostrar que tu negocio/vida van bien a través de tu día a día.",
                        slides: [
                                { overlay: "bottom", body: "(*Tareas de hoy*):\n\n✅ (*Tarea 1*)\n✅ (*Tarea 2*)\n✅ (*Tarea 3 que deje claro que tu negocio va bien*)" }
                                              ]
        },
        {
                        id: "f-dopaminadiaria", category: "flex", title: "Dopamina diaria",
                        objective: "Mostrar cercanía con tus clientes a través de sus victorias. Foto tuya (cara visible) + captura de una victoria de un cliente.",
                        slides: [
                                { overlay: "bottom", body: "==Mi dosis diaria de dopamina== es escuchar victorias de clientes" }
                                              ]
        },
        {
                        id: "f-mejorar", category: "flex", title: "Mejorar",
                        objective: "Mostrar tu progreso personal o profesional de forma visual. Foto de algo que refleje los resultados que has conseguido (vistas desde tu balcón, tu portfolio, una cena cara, tu físico).",
                        slides: [
                                { overlay: "full", body: "==(*Mejorar: hazte más rico, ponte más fuerte...*)==" }
                                              ]
        },
        {
                        id: "f-bienvenida", category: "flex", title: "Bienvenida al equipo",
                        objective: "Dar la bienvenida a un nuevo cliente y mostrar un adelanto de lo que va a recibir. Slide 1: foto/captura de la llamada con el cliente. Slide 2: sneak peek de lo que incluye trabajar contigo.",
                        slides: [
                                { overlay: "bottom", body: "==Bienvenido al equipo== 🎉\n\n(*Nombre del cliente*)" },
                                { overlay: "bottom", body: "Esto es un adelanto de lo que le espera dentro de (*tu programa/servicio*) 👀" }
                                              ]
        },
        {
                        id: "f-nuevomontaje", category: "flex", title: "Nuevo montaje",
                        objective: "Mostrar tu nuevo setup de trabajo/grabación de forma cercana. Slide 1: foto general del setup. Slide 2: detalle de una pieza concreta.",
                        slides: [
                                { overlay: "bottom", body: "Nuevo montaje ==(*adjetivo: brutal, una pasada...*)== 🔥" },
                                { overlay: "bottom", body: "Mi parte favorita: __(*detalle del setup*)__" }
                                              ]
        },
        {
                        id: "f-antesydespues", category: "flex", title: "Antes y ahora",
                        objective: "Al inicio de una llamada con un cliente, pregúntale cómo estaba antes de empezar contigo y cómo está ahora. Slide 1: su respuesta sobre el 'antes'. Slide 2: su respuesta sobre el 'ahora' (puede incluir clip del vídeo).",
                        slides: [
                                { overlay: "bottom", body: "Le pregunté a (*nombre del cliente*): \"¿Cómo estabas ==antes== de empezar conmigo?\"" },
                                { overlay: "bottom", body: "\"¿Y dónde estás __ahora__?\"\n\n(*Su respuesta*)" }
                                              ]
        },
        {
                        id: "f-porquenotu", category: "flex", title: "¿Por qué no tú?",
                        objective: "Mostrar la transformación o testimonio de un cliente con una pregunta directa que invite a identificarse. Añade una captura que muestre el antes/después o el testimonio del cliente.",
                        slides: [
                                { overlay: "full", body: "==¿Por qué no tú?==" }
                                              ]
        },
        {
                        id: "f-ayudandocliente", category: "flex", title: "Ayudando a un cliente",
                        objective: "Grabar un momento real dando feedback a un cliente en un punto clave, destacando el insight que le diste y algo valioso de trabajar contigo.",
                        slides: [
                                { overlay: "bottom", body: "(*Clip real dando feedback a un cliente en un momento clave, con el insight que le diste*)" }
                                              ]
        },
        {
                        id: "f-adelantovideo", category: "flex", title: "Adelanto de vídeo",
                        objective: "Publicar el adelanto de un vídeo que subirás al día siguiente para generar expectación.",
                        slides: [
                                { overlay: "full", body: "(*Adelanto visual de un vídeo que publicarás mañana*)" }
                                              ]
        },

            /* ============================= VALOR ============================= */
        {
                        id: "val-menorimportancia", category: "valor", title: "Dar demasiada importancia a lo pequeño",
                        objective: "Aportar perspectiva sobre qué cosas importan menos de lo que parece.",
                        slides: [
                                { overlay: "bottom", body: "(*Acción pequeña que tu cliente ideal sobrevalora*) ==no es tan importante== como cree.\n\nLo que realmente importa es __(*lo que de verdad marca la diferencia*)__" }
                                              ]
        },
        {
                        id: "val-buenconsejo", category: "valor", title: "Buen consejo, mal momento",
                        objective: "Aportar valor explicando el orden correcto de las acciones en tu nicho.",
                        slides: [
                                { overlay: "bottom", body: "Muchas veces el ==orden en el que haces las cosas== importa tanto como las cosas en sí.\n\n(*Ejemplo: algo en lo que se centran los principiantes de tu nicho*) __no es importante hasta que están más avanzados__" }
                                              ]
        },
        {
                        id: "val-webpococonocida", category: "valor", title: "Web poco conocida",
                        objective: "Compartir una herramienta útil y poco conocida para aportar valor.",
                        slides: [
                                { overlay: "bottom", body: "==(*Nombre de la app o web útil*)==, la herramienta que uso habitualmente y que la mayoría de la gente no conoce" }
                                              ]
        },
        {
                        id: "val-resultadolento", category: "valor", title: "Resultados que tardan",
                        objective: "Compartir una táctica valiosa que requiere paciencia.",
                        slides: [
                                { overlay: "bottom", body: "(*Pequeña táctica que beneficia a tu nicho*)\n\n__Tarda en dar resultados__, pero funciona" }
                                              ]
        },
        {
                        id: "val-demasiadobueno", category: "valor", title: "¿Demasiado bueno para ser verdad?",
                        objective: "Compartir un método sorprendente que realmente funciona.",
                        slides: [
                                { overlay: "bottom", body: "==(*Método que suena demasiado bueno para ser verdad*)==\n\nPero realmente funciona. Lo he usado para conseguir (*resultado*)" }
                                              ]
        },
        {
                        id: "val-4tipos", category: "valor", title: "4 tipos de contenido",
                        objective: "Enseñar tu framework de contenido explicando los 4 tipos/pilares que usas y por qué funcionan juntos.",
                        slides: [
                                { overlay: "bottom", body: "Estos son los ==4 tipos de contenido== que uso para (*conseguir objetivo: crecer, vender...*)" },
                                { overlay: "bottom", body: "1. (*Tipo 1*) → (*para qué sirve*)\n2. (*Tipo 2*) → (*para qué sirve*)\n3. (*Tipo 3*) → (*para qué sirve*)\n4. (*Tipo 4*) → (*para qué sirve*)\n\nUsa __los cuatro__ y verás el cambio" }
                                              ]
        },
        {
                        id: "val-modelosmentales", category: "valor", title: "Modelos mentales",
                        objective: "Explicar los modelos mentales/creencias necesarias para alcanzar cierto nivel de éxito en tu sector. Cada slide añade un modelo nuevo, manteniendo los anteriores visibles si es posible.",
                        slides: [
                                { overlay: "bottom", body: "Estos son los ==modelos mentales== que necesitas para (*conseguir tal nivel de éxito*)" },
                                { overlay: "bottom", body: "1. (*Modelo mental 1*)\n\n(*Breve explicación*)" },
                                { overlay: "bottom", body: "2. (*Modelo mental 2*)\n\n(*Breve explicación*)\n\n__Domina estos y todo cambia__" }
                                              ]
        },
        {
                        id: "val-rasgoexito", category: "valor", title: "El rasgo que marca la diferencia",
                        objective: "Explicar un rasgo clave que comparten tus mejores clientes/resultados y por qué les permite tener éxito. Que sea un rasgo aspiracional con el que el avatar quiera identificarse.",
                        slides: [
                                { overlay: "bottom", body: "Hay ==un rasgo== que tienen en común todos mis (*mejores clientes/resultados*)" },
                                { overlay: "bottom", body: "__(*El rasgo concreto*)__\n\nY es lo que les permite (*conseguir el resultado*), aunque (*obstáculo común*)" }
                                              ]
        },
        {
                        id: "val-lamayormentira", category: "valor", title: "La mayor mentira",
                        objective: "Aportar valor respondiendo en formato Q&A a una pregunta directa sobre las creencias erróneas de tu sector.",
                        slides: [
                                { overlay: "bottom", body: "En un Q&A, pregúntate:\n\n**\"¿Cuál es ==la mayor mentira== en (*tu sector*)?\"**\n\nResponde como veas." }
                                              ]
        },
        {
                        id: "val-luchaasolucion", category: "valor", title: "De la lucha a la solución",
                        objective: "Validar con una encuesta el punto de dolor de tu audiencia y guiarla hacia la claridad como solución real, mostrando autoridad. Slide 1: imagen limpia de fondo con contraste. Slide 2: foto de tu día a día. Slide 3: foto tuya en tu elemento + gráfico de un logro reciente.",
                        slides: [
                                { overlay: "bottom", body: "¿Con qué te atascas más en ==(*tema de tu sector*)==?\n\n**Encuesta:** (*Dificultad 1*) / (*Dificultad 2*)" },
                                { overlay: "bottom", body: "Antes pensaba que necesitaba __(*un error común*)__.\n\nPero (*tu sector*) no premia (*el error*) primero. Premia ==la claridad==." },
                                { overlay: "bottom", body: "La gente que gana (*en tu sector*) repite __un mensaje claro__.\n\nCon el tiempo, (*cómo llega el resultado soñado*)." }
                                              ]
        },
        {
                        id: "val-trabajoaburrido", category: "valor", title: "Haz el trabajo aburrido",
                        objective: "Aportar valor identificando una tarea importante que la gente de tu nicho evita por ser aburrida, y compartiendo un tip para hacerla más llevadera.",
                        slides: [
                                { overlay: "bottom", body: "¿Cuál es esa tarea importante que la gente de tu nicho evita porque es aburrida?\n\nComparte un tip rápido para hacerla ==más fácil, más llevadera o más eficiente==." }
                                              ]
        }
          ];
