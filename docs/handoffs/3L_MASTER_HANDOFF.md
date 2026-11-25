# 3L · Master handoff

25 de noviembre de 2026, Dubái. DRI Codex, modo SOLO. Ejecución local en `Conquereleven/tres-leches-demo`.

## Producción y autorización

El conector de Railway confirmó por metadata de solo lectura el despliegue **SUCCESS** de Production en `a15be421feb41580f1212df02e13206edbea7ba0` (`main`), deployment `d0651a57-0077-4da2-84c3-b6af11b9bf38`, actualizado el 24 de noviembre a las 17:57:58 UTC. El predecesor aparece REMOVED. El endpoint público de liveness quedó inaccesible desde la herramienta web, por lo que la comprobación se limita al estado de despliegue de Railway. Ningún candidato de esta corrida se publicó.

El último GO cubre código, tests, fixtures desechables, evidencia y commits **locales**. La instrucción de continuidad sustituye la autorización anterior de push. Cada push requiere GO específico para su nuevo SHA y destino. Merge, despliegue, publicación de catálogo persistente, infraestructura, proveedores y datos de clientes quedan fuera del alcance.

## Gobernanza

`Conquereleven/cornertech-ai@74488a3a13e3dbf00c4513701df2f90272172f6d`, confirmado como `main` por GitHub. Leídos Execution Standard 1.1, CT-WCOS v1.1 + 9D, AMAE, permisos, human-in-the-loop y AGENTS. Aplicados AGENTS local, controles de Operations/Analytics y RG3. Los candidatos carecen de CLAUDE.md versionado. **PREPARED** significa listo para ejecutar. **EXECUTED** significa cambio producido. **VERIFIED** indica comprobación en el entorno declarado. **CLOSED** requiere aceptación del Founder. La revisión del implementador es propia.

## Estado de los candidatos

| Track | Rama local y worktree | Commit local | PR y head remoto observado |
|---|---|---|---|
| A/C · RT01.3 | `local/rt013-final-polish`, `/private/tmp/3l-rt013` | EXECUTED `9695d7ca82bde4aa150ff1e69006df79199cf0a6`. Padre RT01.2 `3d1ae44d72c5b48bb19039fde02e49a1db47daf5`. | [Draft #85](https://github.com/Conquereleven/tres-leches-demo/pull/85) · `3d5be2f4e128a31ef8e7e02097c10211c5d36f01` |
| B · RT02.2 | `local/rt022-dashboard-rebuild`, `/private/tmp/3l-rt022` | EXECUTED `80ac46f0b9cb669ca6469a47e552383fd381c96e`. Incluye el rebuild `82dfe8aee9c73f479ec386346de15c2d9a96457f` sobre `f2cb26a` y la corrección de enlaces de pago sin conversación. | [Draft #86](https://github.com/Conquereleven/tres-leches-demo/pull/86) · `9390fdeea30db349577805b1099e19c2490eeb8b` |

CI histórico del head remoto de #85. [V3.2](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550911697), [Commerce](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550911581), [Conchas](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550911707), [Packs](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550911709).

CI histórico del head remoto de #86. [Operations](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550941337), [Analytics](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550941405), [Commerce](https://github.com/Conquereleven/tres-leches-demo/actions/runs/45550941260).

Destinos de fast-forward, confirmados por GitHub al cierre de la sesión:

- A/C · `refs/heads/release/3l-rt01-1-storefront-polish-20261125`.
- B · `refs/heads/release/3l-rt02-1-tatbiq-20261125`.

Las listas exactas son [A/C contra #85](3L-2026-11-25-evidence/archivos-A-vs-draft85.tsv) y [B contra #86](3L-2026-11-25-evidence/archivos-B-vs-draft86.tsv). La carpeta de evidencia se guarda junto a la copia de este handoff en el workspace CTAI23. Los bundles requieren como base los head remotos enumerados. El commit del handoff en A/C cambia únicamente documentación, por encima del SHA de ejecución validado.

## Historial de decisiones y fuentes

- La referencia Storefront V3.2 del 22 de noviembre y REF_A Menú, REF_B Home/Historia, REF_C selector escritorio y REF_D selector móvil siguen siendo la base visual. El Founder rechazó la implementación de #82 por reutilizar estructura previa, divergir de la geometría editorial y usar imágenes pequeñas. La integración de #83 tampoco obtuvo aprobación visual. El hilo de diseño y fuentes está en [Draft #82](https://github.com/Conquereleven/tres-leches-demo/pull/82) y en `docs/brand/visual-v32-integration.md`.
- El Founder rechazó la propuesta publicada del dashboard RT02.1. Señaló mezcla de interfaces, jerarquía pobre, módulos poco claros y flash de frontend anterior. RT02.2 usa `~/Downloads/tatbiq-project_6215932b-1795414938074.zip`, SHA-256 `79a03865627f2b7e745adb7e523415b98cc38614704013f13767050f731f11bd`. Referencias concretas `components/Layout.jsx`, `components/Card.jsx`, `pages/HomePage.jsx`, `pages/OrdersPage.jsx`, `pages/ProductsPage.jsx` y `index.css`. El ZIP revisado `3L_TatbiQ_reviewed_source_2026-11-22.zip` es storefront. El ZIP administrativo del 22 de noviembre que usó RT02.1 tuvo SHA-256 `96377a361d731a6ced3a9ca20273a9b047eb245f11df093ad9e71017f6a07236`.
- El último mandato confirma Pan de Muerto individual y packs durante todo el año, supersediendo el cierre histórico del 15 de noviembre para las piezas sueltas. Se mantiene el mínimo de seis por SKU suelto, packs fijos/personalizados según sus reglas vigentes y las combinaciones retiradas. Bolillo conserva mínimo de seis.
- Las Conchas de pistache retiradas en RT01.1 siguen fuera de venta, incluida la familia rellena y sus packs. Vainilla, chocolate y Tricolor conservan identidades y opciones. Se registraron las fotos ambiguas sin asignar.
- Panettone Normal, Chocolate y Pistacchio, tamaños Mini AED 27 y Normal AED 170, venta anual al publicarse. El Founder confirmó portadas 09, 14 y 11, respectivamente, del producto Normal. Las tomas grupales de Mini siguen sin asignación individual. Contiene gluten y la variante Pistacchio contiene pistache. Declaración completa, pesos e ingredientes siguen pendientes. Product Hub mantiene autoridad de publicación.
- Contact conserva los canales comerciales vigentes y las exclusiones anteriores. El retrato de Home conserva las líneas originales de dibujo. La trayectoria física México → Dubái conserva su orden y las etiquetas se componen en su idioma.

## Inventario y decisiones de fotografía

94 archivos JPEG en `~/Downloads/NUEVAS` inspeccionados visualmente en cuatro láminas. El [CSV de originales, SHA-256, decisiones y SKU](3L_RT013_FOTOGRAFIAS.csv) se encuentra también en el worktree A. El JSON técnico `src/brand/rt013-media.json` registra 10 portadas, 3 imágenes editoriales y cada derivado WebP con hash. Se añadieron ángulos inequívocos de Bisquets y Orejas, que estaban fuera de las carpetas principales. Las Mantecadas quedan identificadas sin SKU vigente confirmado. Quedan sin asignar originales ambiguos para Tricolor, packs y los rellenos de crema diplomática y cajeta. Panettone usa los derivados centrados de las fotos previamente aprobadas y trazadas en `data-imports/rt012-panettone/manifest.json`.

## Resultados y continuación

Track B entrega sidebar y cabecera, contexto de entorno, Overview con prioridades y pipeline en la composición Tatbiq, y módulos existentes dentro del mismo marco. HTML inicial privado para Operations, con guardas de indexación y autenticación. Se corrigió un fallo para pedidos sin conversación asociada. Las acciones de conversación conservan sus requisitos de asignación. La validación incluye solicitudes anónimas, cuatro roles y Analytics restringido, además de 390, 768 y 1440 px.

Track A/C entrega reemplazos de medios, disponibilidad anual, mínimo inicial seis y rechazo en servidor, Panettone encuadrado y V3.2 prerenderizado para idioma explícito. El primer render AR preserva México de un lado y Dubái del otro. Se revisaron búsqueda, categorías, Cart y Rosca de Reyes.

### Validación por SHA

| Verificación | A/C `9695d7c` | B `80ac46f` |
|---|---|---|
| Build, typecheck, lint | Correctos, incluidas auditorías i18n y copy del build | Correctos, incluidas auditorías i18n y copy del build |
| Suites enfocadas Node | 82/82 | 46/46 |
| Sites Worker | 4/4 | 4/4 |
| Comprobaciones del handler y Chromium nativo | 46/46, 25 capturas | 54/54, 33 capturas |
| Suites oficiales Playwright con listener | Descubiertas 24 en V3.2. Bloqueadas al iniciar el servidor de la suite | Descubiertas 208 en Operations. Bloqueadas al iniciar el servidor de la suite |

A/C comprobó HTML inicial en EN/ES/AR, cotización que rechaza 1 y 5 y acepta 6, y los selectores de mínimo seis en los tres idiomas. Se comprobaron chocolate, vainilla y Tricolor en catálogo y selector AR. El HTML y Chromium muestran V3.2 en primer pintado con JavaScript retenido. El retrato completa sin scroll. Panettone tuvo tres sabores, dos tamaños, precios, imágenes completas y fichas directas. Se comprobaron los contactos retirados, Cart con una línea real del fixture y Journal de Rosca de Reyes.

B comprobó primer pintado con JavaScript retenido, 11 rutas HTML de Operations incluidos detalles, 3 rechazos anónimos y 4 sesiones sintéticas con permiso por rol en Analytics. Diez módulos se abrieron a 390/768/1440 sin scroll horizontal global. Se verificaron acceso, navegación y devolución de foco. Diagnostics conserva su exclusión en TEST y su gate de staging. Product Hub se verificó con un catálogo inicializado en fixture. La parte visual se comparó con Home, Orders y Products del ZIP Tatbiq compilado localmente.

El loopback devolvió EPERM en ambos previews. Chromium nativo funcionó en proceso único, enlazado al handler Node y SQLite sintético. Las capturas, fixtures reproducibles y logs están en `3L-2026-11-25-evidence/`. Para un entorno con loopback, ejecutar desde cada worktree `node --import tsx /ruta/a/native-verify.mts a --serve` o `node --import tsx /ruta/a/native-verify.mts b --serve`. URLs previstas `http://127.0.0.1:4178/?lang=ar` y `http://127.0.0.1:4177/operations/overview`. El script controla usuarios sintéticos. Ningún valor de acceso pertenece a producción.

### Bloqueos y próxima ejecución

- **Push** · BLOCKED por GO específico. Releer el head de #85 y #86, comprobar con `git merge-base --is-ancestor <head-remoto> <sha-candidato>`, y avanzar cada rama por fast-forward tras la autorización. Los bundles verificados conservan los objetos incluso si se limpia el directorio temporal.
- **Catálogo publicado** · Cada instalación dinámica respeta su revisión vigente. Los archivos de media y copy alimentan bootstrap y la revisión sintética, y el Panettone se publicó solo en el fixture. Para una revisión existente, preparar el delta de fotos, copy y Panettone en el Product Hub autorizado y aplicar su flujo de revisión/publicación tras el GO correspondiente. Mantener las fotos ambiguas pendientes.
- **Aceptación** · Ejecutar los Playwright oficiales y mediciones de accesibilidad en un host con loopback, revisar el contraste en navegador y completar revisión independiente y aceptación visual del Founder sobre cada SHA. Mantener ambos PR en Draft durante CI. Las comprobaciones locales descritas quedan VERIFIED. El veredicto global de cada track queda EXECUTED hasta completar esos controles. No hay estado CLOSED.
