# Generador manual de fichas científicas

Este ejecutable local implementa el [contrato editorial 1.0.0](CONTRATO_EDITORIAL_FICHAS.md). Recibe una fecha de noticia y una URL explícitas. No lee `public/fuentes.tsv`, no se ejecuta durante el build y no modifica ni publica contenido de la web.

## Instalación y configuración

Entorno utilizado: **Node.js 24.15.0**, npm 12.0.2. Desde la raíz del repositorio:

```bash
npm ci
```

Las dependencias locales de este flujo están en `devDependencies`: **Cheerio 1.2.0** analiza HTML/XML con un parser real, conservando encabezados y tablas y excluyendo navegación y scripts; **playwright-core 1.63.0** controla Chrome instalado para permitir la verificación humana en la misma sesión que recupera el artículo. Node no ofrece estas capacidades de navegador. `playwright-core` no instala un navegador ni requiere un SDK de IA. Se usan además `fetch`, `node:crypto`, `node:fs/promises`, `node:child_process` y `node:test`. La web no importa estos módulos. Instalar con `--omit=dev` no instala el generador completo.

El acceso asistido requiere **Google Chrome instalado, un escritorio activo y una terminal interactiva**. Usa el canal `chrome` de Playwright y un contexto temporal aislado del perfil personal. Si se necesita otro ejecutable Chrome/Chromium, indicar su ruta absoluta mediante `FICHAS_BROWSER_PATH`. No se instala Chrome ni se descargan navegadores automáticamente. Referencia: [navegadores y canales de Playwright](https://playwright.dev/docs/browsers).

Para PDF textual se necesitan `pdfinfo`, `pdfimages` y `pdftotext`, del paquete del sistema Poppler; en este entorno ya estaban instalados (22.02.0). En Debian/Ubuntu, si faltan:

```bash
sudo apt-get install poppler-utils
pdfinfo -v
pdfimages -v
pdftotext -v
```

Variables requeridas, exclusivamente en el entorno local:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Variable opcional: `FICHAS_DIR`. Por defecto es `data/fichas`, resuelta desde la raíz que identifica el propio módulo. También admite una ruta absoluta. Se rechazan rutas dentro de `public/`, incluidos enlaces simbólicos. Si se elige otra ruta dentro del repositorio, agregala a las exclusiones locales de Git antes de guardar fichas allí.

[.env.example](../.env.example) contiene las claves vacías. Completalas en `.env.local` con un editor, preservando cualquier configuración que ya exista. No copies el ejemplo encima de un archivo de entorno existente. No uses variables `NEXT_PUBLIC_*`. `.env.local` sigue ignorado por Git; el ejemplo se puede versionar.

**Node no carga automáticamente `.env.local`.** En Node 24 se carga explícitamente así:

```bash
node --env-file=.env.local scripts/fichas/generar-ficha.mjs \
  --fecha 2026-10-01 \
  --url 'https://ejemplo.org/articulo'
```

La URL del ejemplo es ilustrativa: reemplazar por la URL legítima del documento. Si las variables ya están exportadas en la terminal, la interfaz mínima es:

```bash
node scripts/fichas/generar-ficha.mjs \
  --fecha 2026-10-01 \
  --url 'https://ejemplo.org/articulo'

node scripts/fichas/generar-ficha.mjs --help
```

Desde otro directorio, usar rutas absolutas al archivo de entorno y al ejecutable:

```bash
node --env-file='/ruta/al/repositorio/.env.local' \
  '/ruta/al/repositorio/scripts/fichas/generar-ficha.mjs' \
  --fecha 2026-10-01 --url 'https://ejemplo.org/articulo'
```

Las credenciales no se escriben en argumentos, ejemplos, JSON, respuestas guardadas o logs. Los diagnósticos no reproducen cuerpos HTTP ni mensajes de excepciones externas. También se rechazan entradas o salidas que contengan la credencial configurada; si la propia URL contiene esa credencial, no se persiste una identidad que la exponga.

## Modelo, disponibilidad y cuota

No hay identificador de modelo predeterminado ni promesa de gratuidad. Usar exactamente el identificador disponible para el proyecto administrador; se admite el prefijo `models/`. El valor configurado se conserva en `generacion.modelo`.

Consultar [Models: list/get](https://ai.google.dev/api/models) para disponibilidad, métodos admitidos y límites de contexto. La [guía oficial de cuotas](https://ai.google.dev/gemini-api/docs/rate-limits) enlaza los límites activos del proyecto en Google AI Studio. Revisarlos antes de ejecutar; dependen del modelo y de la cuenta.

La integración usa [Gemini Developer API REST, generateContent](https://ai.google.dev/api/generate-content), con `x-goog-api-key`, instrucciones separadas y esquema JSON. No habilita herramientas, búsqueda, ejecución ni acceso a enlaces secundarios. Antes de generar consulta `models.get` para el identificador configurado. No sigue redirecciones de la API, no registra su cuerpo de error y no reintenta automáticamente solicitudes de IA.

`solicitudes_ia` cuenta intentos de `generateContent` de esa ejecución, incluso los fallidos. La consulta de metadatos de modelo no se cuenta como generación. Los tokens son la suma de `promptTokenCount` y, por separado, `candidatesTokenCount` realmente informados; este último no incluye tokens internos de razonamiento. Ante consumo no informado o respuesta de red fallida, el acumulado correspondiente queda en `null`, no se estima. Los contadores de una revisión válida preservada siguen describiendo la generación de ese análisis; el intento fallido tiene su registro propio.

## Identidad, estados y persistencia

`--fecha` es una fecha gregoriana real, con cuatro dígitos de año, dos de mes y dos de día. Es la fecha de **noticia web**, independiente de la fecha científica extraída. La URL debe ser HTTP(S) absoluta, sin credenciales embebidas ni caracteres de control internos. Solo se aplica `trim()` para obtener `url_normalizada`: se conservan ruta, mayúsculas, parámetros, escapes y fragmento en la identidad.

```text
SHA-256(UTF-8("ficha:v1\n" + fecha_noticia + "\n" + url_normalizada))
```

Aquí `\n` representa LF real. Se utiliza el hexadecimal completo de 64 caracteres. El hash no depende del modelo ni del prompt.

La salida principal es:

```text
data/fichas/YYYY-MM/ficha_YYYY-MM-DD_<sha256>.json
```

El directorio predeterminado está ignorado por Git. Se crean archivos con modo `0600` y directorios con `0700` cuando son nuevos. Se guarda el TXT del cuerpo utilizado en el control de cobertura, descrito más abajo; no se almacenan el HTML/PDF original, las notas intermedias ni las respuestas HTTP. Los PDF descargados usan un directorio temporal privado, eliminado al terminar. La escritura JSON usa un temporal exclusivo en el mismo directorio, `sync()` del archivo y `rename`; un fallo de escritura no deja un JSON parcial en la ruta principal.

Cada intento de generación, exitoso o fallido, guarda además un **TXT con el texto exacto usado para contar las palabras del cuerpo**, excluyendo las secciones clasificadas como abstract, referencias y regiones auxiliares. El TXT no agrega títulos de diagnóstico, localizadores ni encabezados que no formen parte de ese conteo; conserva los textos de tablas y marcadores de página presentes en el cuerpo contado. El filtro es el mismo que usa el control de las 300 palabras. Es material para inspeccionar la extracción, no una declaración de que haya superado la validación.

```text
data/fichas/YYYY-MM/YYYY-MM-DD-HH-mm-ss-SSS.txt
```

Se guarda junto al JSON principal: con `FICHAS_DIR`, la ruta es `FICHAS_DIR/YYYY-MM/`. El directorio mensual corresponde a `--fecha`; el nombre del TXT corresponde al inicio del intento **en UTC**, con hora, minutos, segundos y tres dígitos de milisegundos. Ejemplo: `2026-11-01-00-00-00-123.txt`. Si el nombre ya existe, se incrementa el milisegundo hasta encontrar uno libre, sin reemplazar archivos anteriores, incluso entre identidades concurrentes. Se reutiliza la escritura temporal y `sync()`; el TXT completo se publica mediante un enlace de archivo exclusivo (`link`) y se elimina el temporal.

El TXT se guarda antes de invocar IA y se conserva si después falla Gemini, la validación del resultado o la persistencia JSON. Si falla el control de cobertura, contiene el cuerpo que no alcanzó ese control. Si solo hay abstract o el fallo ocurre antes de obtener texto evaluable (bloqueo, cancelación, transferencia o estructura ilegible), se crea un TXT vacío; el motivo permanece en el diagnóstico JSON. No se copian al TXT las credenciales detectadas ni los mensajes de excepciones externas. Si falla la escritura del TXT, se informa `TXT_COBERTURA_NO_PERSISTIDO`, se intenta persistir el diagnóstico `ERROR` y no se inicia IA.

Ambas CLI muestran `TXT del cuerpo evaluado: <ruta>`. Cada reintento y cada regeneración con `--force` producen otro TXT; una ficha completa reutilizada no vuelve a recuperar el documento ni crea otro TXT. Tampoco se crean archivos por ayuda, argumentos inválidos o rechazo por un lock activo. Una caída forzada antes de exportar o un fallo de disco/permisos puede impedir el TXT; no existe una transacción conjunta entre TXT y JSON. No se modifica la estructura normativa de la ficha.

| Situación                                               | Resultado                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primera generación correcta                             | `CREADO`, revisión 1, intento 1, `error_actual: null`.                                                                                                                                                                                                                                                                                                                      |
| Ficha íntegra existente, sin `--force`                  | Se valida su forma, identidad y consistencia, se muestra su ruta y se omiten recuperación e IA. No se necesitan credenciales para omitirla.                                                                                                                                                                                                                                 |
| Ficha `ERROR`                                           | Se reintenta aun sin `--force`. Aumenta `intentos`; el histórico `tuvo_error` permanece `true`.                                                                                                                                                                                                                                                                             |
| Error repetido                                          | Sigue `ERROR`, sin análisis; aumenta `intentos`, conserva `revision`.                                                                                                                                                                                                                                                                                                       |
| Éxito después de un registro anterior, incluido `ERROR` | Nueva revisión (`revision + 1`), `CREADO`, `error_actual: null`, conserva `creado_en` y `tuvo_error`. Así, un ERROR inicial en revisión 1 se recupera en revisión 2.                                                                                                                                                                                                        |
| `--force` sobre `CREADO` o `PENDIENTE`                  | Archiva el registro previo y genera una nueva revisión `CREADO`, que requiere revisión editorial de nuevo.                                                                                                                                                                                                                                                                  |
| `--force` fallido sobre ficha válida                    | Guarda un registro normativo `ERROR` independiente en `historial/`; conserva análisis, revisión, estado, lectura y generación de la ficha principal. Solo actualiza `intentos`, `tuvo_error` y fecha de auditoría de esa ficha válida. Su `error_actual` sigue en `null` porque ese análisis continúa vigente. Para intentar reemplazarlo nuevamente se necesita `--force`. |
| `--force` sobre `INCLUIDO`                              | Se rechaza antes de recuperación/IA y se registra el diagnóstico independiente. Conserva revisión e inclusión vigentes; no implementa invalidación mensual.                                                                                                                                                                                                                 |
| JSON existente corrupto o identidad inconsistente       | No se sobrescribe, incluso con `--force`. Se guarda un `ERROR` separado para inspección manual.                                                                                                                                                                                                                                                                             |
| Artículo no verificable                                 | `ERROR`, `analisis: null`, ningún intento de generación IA. Si hubo extracción pero falló la cobertura, se conservan sus metadatos y hash con `texto_completo_verificado: false`; si ni siquiera hubo extracción, `lectura: null`.                                                                                                                                          |
| Argumentos inválidos                                    | Código 2 y diagnóstico, sin fabricar ficha. Otros fallos devuelven código 1. Éxito, omisión y ayuda devuelven 0.                                                                                                                                                                                                                                                            |

Las revisiones y diagnósticos independientes se guardan bajo `YYYY-MM/historial/<sha256>/`, con revisión, intento y un UUID en el nombre, sin agregar campos al JSON normativo. No representan nuevas fichas activas ni inclusión mensual. La ruta principal es el registro vigente.

Un archivo `.lock` exclusivo evita ejecuciones simultáneas de la misma identidad, manteniendo el bloqueo durante recuperación, IA y persistencia. Si un proceso muere abruptamente, se deja el bloqueo para impedir duplicaciones: inspeccionar el PID y retirar manualmente ese archivo **solo si el proceso ya no está activo**. No hay vencimiento automático. Un bloqueo activo o una imposibilidad de crear el directorio se informa sin iniciar la generación. Si el disco o los permisos impiden también guardar el diagnóstico, se informa explícitamente esa imposibilidad. Los archivos se escriben atómicamente de forma individual; no hay una transacción de múltiples archivos ante una caída del proceso o sistema.

## Qué cobertura se verifica

La aplicación comprueba cobertura **antes de invocar Gemini**. Primero hace un GET público, con hasta cinco redirecciones HTTP(S), sin cookies ni ejecución de JavaScript. Si identifica una pantalla de verificación humana o de navegador, permite el acceso asistido descrito más abajo. Un error de red, paywall, abstract o rechazo HTTP genérico no abre Chrome. Ambas vías rechazan estados distintos de 200, respuestas parciales, longitud incoherente, cuerpos documentales superiores a 25 MiB y errores de codificación.

- **HTML:** identifica un contenedor de artículo con cierre explícito (`article`, `articleBody`, `#artText`, `#article-body`, `.article-body` o un `main` con metadatos de publicación); excluye scripts y navegación, conserva secciones y tablas textuales. Los contenedores anidados pertenecen al mismo documento; entre candidatos independientes se prioriza la coincidencia de su `h1` con el título bibliográfico. Si la selección depende de la longitud, se registra la ambigüedad. Detecta avisos de bloqueo, contenido parcial y abstracts, incluso estructurados.
- **XML:** admite JATS con `article`, `body`, `back` y elementos cerrados verificables. Rechaza entidades personalizadas/externas, truncamientos y evidencia flotante no integrada. No resuelve DTD externos.
- **PDF:** verifica cabecera y cierre, descarta documentos protegidos, contrasta páginas extraídas con `pdfinfo` y exige texto legible en cada página. `pdfimages -list` debe confirmar un inventario sin imágenes rasterizadas; incluso un logotipo puede motivar un rechazo conservador. `pdftotext -layout` conserva el orden y se numeran las páginas físicas desde 1. Se rechazan advertencias de Poppler, páginas sin texto suficiente, referencias a tablas/figuras que no se pueden interpretar fiablemente y PDFs escaneados. No se hace OCR. La metadata bibliográfica PDF queda en `null`/lista vacía cuando no se puede atribuir al artículo, sin inferirla del nombre del archivo.

El control de extensión exige **al menos 300 palabras de cuerpo**, excluidos abstract, regiones auxiliares y referencias. Se siguen clasificando encabezados en español o inglés y se admiten encabezados combinados, pero no se exige que aparezcan introducción, métodos, resultados, discusión, referencias o limitaciones como secciones delimitadas. Se conservan todos los segmentos extraídos, incluidos abstract, metadatos, referencias y preámbulo; conservarlos no implica contarlos como cuerpo. Cada subsección tiene un identificador local estable en esa extracción. El hash corresponde exactamente al texto canónico enviado al modelo, incluidos encabezados y marcadores de página; no es el hash del PDF binario.

Para separar abstract y cuerpo en HTML se priorizan los contenedores: marcas como `role="doc-abstract"`, `itemprop="abstract"`, IDs/clases de abstract (incluido `Abs1`), `aria-labelledby` y secciones cuyo encabezado propio identifica el resumen. El cierre del contenedor termina su alcance, aunque la sección siguiente use encabezados de menor nivel. Los títulos internos de métodos o resultados siguen perteneciendo al abstract. Se reconocen también encabezados accesibles con `role="heading"` y `aria-level`, y se conservan los encabezados contenidos en `header`.

Las regiones reconocidas de autores, afiliaciones, financiación, licencias y artículos relacionados se conservan como contexto, pero no aportan palabras al mínimo del cuerpo. En `assertCoverage`, de [retrieval.mjs](../scripts/fichas/retrieval.mjs), quedan **comentados y desactivados** los mínimos por categoría (introducción 60, métodos 80, resultados 80, discusión 80 y referencias 30) y la exigencia de localizar limitaciones (sección de al menos 25 palabras o expresión reconocida en el cuerpo). Se desactivan por su dependencia del layout: una sección ausente, breve o sin encabezado reconocido no causa por sí sola un rechazo. El umbral de 300 palabras es un criterio de la implementación, no un valor establecido por el contrato ni una prueba de integridad. `lectura.alcance_y_observaciones` explicita que no se exigieron mínimos por sección ni localización de limitaciones; esto no elimina los campos del análisis ni su revisión editorial posterior.

**Un diseño ambiguo puede aceptarse con aviso si el contenido recuperado supera los controles de cobertura.** Por ejemplo, cuando faltan contenedores propios y se recurre a la jerarquía de encabezados, o cuando los niveles de encabezados internos contradicen una sección delimitada. El aviso comienza con `Evaluación del diseño ambigua:` y se guarda en `lectura.alcance_y_observaciones` y `validacion.observaciones`, sin nuevos campos ni estados. Ambas CLI lo muestran en stderr, también al reutilizar la ficha; un aviso por sí solo no cambia el código de salida de éxito. También se conserva si una extracción parcial o una generación posterior termina en `ERROR`.

Aceptar la interpretación del diseño no permite saltar los controles activos: si solo se obtuvo el abstract, no se alcanzan 300 palabras de cuerpo, hay marcas contradictorias sin cuerpo independiente suficiente o faltan cierres necesarios, se mantiene `ERROR` sin generar con IA. Las reglas no reconocen universalmente todos los diseños editoriales. El aviso requiere revisión de la extracción; no declara aptitud editorial.

Estas comprobaciones son estructurales: **no prueban por sí solas la integridad documental ni la fidelidad científica**. Un cuerpo que alcance 300 palabras no demuestra que se haya recuperado todo el artículo; la revisión debe comprobar su alcance. Pueden rechazarse documentos legítimos breves, material paginado, artículos cuyo cuerpo solo se construye dinámicamente con JavaScript o diseños editoriales no reconocidos. Los gráficos, fórmulas no textuales y tablas en imagen no se dan por leídos. La ausencia de una figura sin rótulo o de un suplemento que el editor no señale no puede certificarse universalmente con un extractor textual. Para documentos no verificables se guarda `TEXTO_COMPLETO_NO_DISPONIBLE` o `COBERTURA_INSUFICIENTE`, sin sustituirlos por un abstract. Esta iteración no es un lector universal de todos los editores ni un intérprete visual de evidencia.

`metodo_recuperacion` se registra como `OTRO` para ambas vías: no se adivina si un dominio corresponde a una editorial o a un repositorio. `alcance_y_observaciones` diferencia el GET directo del acceso asistido y documenta la técnica y sus límites.

## Verificación humana de acceso

El mismo comando del procesador o del generador habilita este paso cuando aparece una pantalla reconocida, por ejemplo `Client Challenge`, `Verify you are human`, `Checking your browser` o un formulario de desafío. Se reconoce también en respuestas HTML con estado 401, 403, 429 o 503. No se intenta resolver automáticamente un CAPTCHA.

1. El script abre Chrome maximizado con la URL original y conserva la ejecución y su `.lock`. La página se adapta al tamaño real de la ventana; no se fuerza un área de 1280 × 720 que pueda ocultar controles en una pantalla más baja. El sistema operativo puede limitar la maximización; también podés ajustar la ventana manualmente.
2. Completá la verificación en esa ventana y elegí tus preferencias si aparece un panel de cookies. Cuando veas el artículo, volvé a **la terminal donde ejecutaste el comando** y presioná **Enter**.
3. El script vuelve a solicitar la URL original en esa misma sesión de Chrome, conservando las cookies de acceso. Esto evita analizar accidentalmente otra página a la que hayas navegado. No vuelve a una descarga de Node sin esa sesión ni busca un PDF alternativo.
4. Analiza la respuesta HTTP recibida con los mismos extractores y controles de cobertura existentes. Se utiliza el HTML original, con sus cierres comprobables: no una serialización del DOM que pueda reparar silenciosamente un documento truncado. El navegador sí ejecuta JavaScript y carga recursos normales de la página para permitir el acceso.
5. Cierra el navegador temporal y, solo si el texto supera los controles, continúa con Gemini. El éxito sigue siendo `CREADO`, con revisión editorial pendiente.

**Presionar Enter confirma que completaste el acceso; no certifica lectura íntegra ni aptitud editorial.** Si sigue la verificación, solo hay un abstract, el cuerpo no alcanza el mínimo total o la evidencia gráfica no se puede interpretar, se persiste `ERROR` sin solicitar generación a Gemini. Algunos sitios pueden rechazar incluso un Chrome controlado por Playwright; no se garantiza acceso universal ni se eluden restricciones de pago.

Que se vean título, `Background`, `Methods` y `Results` no acredita texto completo: esos encabezados también pueden estar dentro de `Abstract`. Si falla el control de extensión, el diagnóstico `COBERTURA_INSUFICIENTE` informa que se requieren **300 palabras fuera del abstract, los metadatos y las referencias**; ya no rechaza por mínimos de palabras de categorías individuales ni por ausencia de limitaciones. Aceptar cookies habilita el acceso, pero no agrega el cuerpo que falte en la respuesta HTML ni interpreta documentos enlazados. Si el editor ofrece el cuerpo únicamente en otro documento, repetir Enter no resuelve esa falta de cobertura.

Si el panel de cookies tapa la página y sus botones no se ven, maximizá la ventana y reducí el zoom con `Ctrl` + `-` (`Cmd` + `-` en macOS). Después de elegir tus preferencias podés restablecer el zoom con `Ctrl` + `0`. En el panel de Springer inspeccionado, las opciones `Accept all cookies` y `Reject optional cookies` están al pie. El script no selecciona ninguna opción ni elimina el panel por su cuenta: la elección corresponde a la persona. Si el bloqueo también aparece en Chrome habitual y persiste con los controles visibles, hace falta revisar el panel concreto; ajustar el tamaño no resuelve todos los posibles fallos del sitio.

Podés escribir `cancelar`, presionar Ctrl+C o cerrar la ventana para interrumpir este paso. También se cancela al cerrar la entrada de terminal o al alcanzar el límite de diez minutos de sesión asistida. Se registra un `ERROR` reintentable y se libera el bloqueo propio del generador. Las señales SIGINT, SIGTERM y SIGHUP se gestionan durante este paso; una terminación forzada del proceso o del sistema conserva la limitación de locks abandonados ya documentada. No se eliminan locks ajenos o activos.

Sin terminal interactiva o sin Chrome/escritorio disponibles, se informa el motivo y se registra `ERROR`, sin IA. Repetir el mismo comando reintenta mediante el generador, preservando `tuvo_error`, intentos e historial; no borrar la ficha ni usar `--force` para esto. Por ejemplo:

```bash
node --env-file=.env.local scripts/fichas/procesar-ficha.mjs \
  --fecha 2026-09-23 \
  --url 'https://link.springer.com/article/10.1186/s12916-026-05132-z'
```

La sesión se crea sin el perfil personal y se cierra al terminar; no se exportan cookies ni credenciales a las fichas. El proceso del navegador recibe solo variables de sistema/escritorio permitidas, no `GEMINI_API_KEY`, `GEMINI_MODEL` ni el resto de `.env.local`. Se conserva únicamente el TXT del cuerpo contado junto a la ficha; no se guardan capturas, trazas, respuestas HTTP ni documentos originales descargados en el repositorio. Chrome administra su perfil temporal; un cierre abrupto del sistema puede impedir su limpieza.

## Generación y revisión editorial

Gemini solo devuelve `titulo_es`, `tipo_documento` y `analisis`. La aplicación extrae los metadatos bibliográficos verificables y construye identidad, auditoría, `lectura`, `generacion`, validación, estados y rutas. El texto del artículo es dato no confiable como instrucción. Una negativa, bloqueo, fin distinto de `STOP`, JSON malformado, campo extra o localizador inventado produce `ERROR`; no se reparan respuestas truncadas para hacerlas pasar por completas.

Se valida toda la estructura normativa, tipos, nulabilidad y estados. Los campos cuantitativos opcionales se representan como texto con magnitud, unidad y contexto, o `null`; las páginas son números físicos PDF o `null`. La síntesis debe tener entre 200 y 350 palabras y los puntos para comparación futura entre 2 y 6. Se verifica que cada hallazgo nombre una sección extraída y, cuando corresponda, una tabla o página de su inventario.

El presupuesto de contexto usa bytes UTF-8 como límite conservador frente al límite de tokens informado por el modelo, sin fingir un conteo exacto de tokens. Cuando el documento no cabe, se fragmenta conservando todo el texto y sus localizadores, se solicitan notas de cada fragmento y se hace una generación de integración final. La fragmentación puede requerir varias llamadas y cuota. No se guarda análisis si falta una sección en las notas, falla un fragmento o la integración no cabe. Nunca se recorta el documento para usar únicamente el abstract. Las notas también requieren revisión editorial: conservar los localizadores no demuestra que el modelo haya preservado correctamente todas las cifras.

Una generación correcta queda **siempre `CREADO`**. `estructura_json_ok`, `identidad_ok` y `texto_completo_ok` registran las comprobaciones efectivas. La identidad se verifica contra los argumentos recibidos; no se afirma contrastación con TSV. `trazabilidad_de_hallazgos_ok`, `coherencia_editorial_ok` y `apta_para_sintesis` permanecen en `false`, con `validada_en: null`: comprobar que existe una sección no prueba que sustente una afirmación. Tampoco se certifican automáticamente cifras, asociación/causalidad ni ausencia de contradicciones. Las observaciones explicitan la revisión pendiente.

## Procesador previo a validación editorial

`scripts/fichas/procesar-ficha.mjs` encapsula al generador existente. Es otro ejecutable **local, manual y optativo**, anterior a la revisión editorial. Recibe fecha y URL directamente; no lee `public/fuentes.tsv`. Utiliza la misma configuración y ruta privada `data/fichas/YYYY-MM/ficha_YYYY-MM-DD_<sha256>.json` (o `FICHAS_DIR`), sin dependencias adicionales a las del generador.

Sin una clave conocida, omitir `--key`:

```bash
node --env-file=.env.local scripts/fichas/procesar-ficha.mjs \
  --fecha 2026-10-02 \
  --url 'https://ejemplo.org/articulo'
```

Si el invocante ya conoce la clave:

```bash
node --env-file=.env.local scripts/fichas/procesar-ficha.mjs \
  --key '<SHA256_HEX_64>' \
  --fecha 2026-10-02 \
  --url 'https://ejemplo.org/articulo'
```

La URL y el marcador de clave son ilustrativos: reemplazarlos por los valores correspondientes. La clave suministrada debe contener exactamente 64 hexadecimales; admite mayúsculas y minúsculas, comparadas con la identidad canónica calculada por `createIdentity`. No se normaliza la URL más allá de `trim()`. La omisión representa `idempotencyKey: null`; la cadena literal `"null"` es inválida. Fecha, URL y coincidencia de clave se verifican **antes de crear directorios, leer fichas o invocar al generador**. La ruta siempre se deriva de esa identidad y de la configuración, nunca de una ruta suministrada como clave.

`GEMINI_API_KEY` y `GEMINI_MODEL` solo son necesarias si corresponde generar. Para reutilizar una ficha consistente no se necesitan credenciales ni `--env-file`; se puede ejecutar `node scripts/fichas/procesar-ficha.mjs` con los mismos argumentos de fecha/URL. Node no carga `.env.local` por sí mismo. Desde otro directorio, usar rutas absolutas al ejecutable y, cuando corresponda, al archivo de entorno.

| Archivo vigente | Comportamiento |
| --- | --- |
| Ausente | Invoca `generateFicha({ date, url, force: false })` una vez y comprueba el archivo persistido. Éxito: `CREADO`, `error_actual: null`. |
| `ERROR` válido | Reutiliza la misma API sin borrar el registro previo. El generador administra reintento, intentos, revisiones e historial; éxito en `CREADO`, nuevo fallo en `ERROR`. |
| `CREADO` válido | Reutiliza sin invocar al generador, incluso con revisión editorial pendiente; conserva exactamente `CREADO` y sus validaciones. |
| `PENDIENTE` o `INCLUIDO` válidos | Reutiliza sin generación ni cambios en estado, validaciones, auditoría o inclusión mensual. |
| JSON corrupto, identidad/estado inconsistente o fallo de lectura | Informa el problema, sin invocar al generador, reemplazar la ficha ni escribir un diagnóstico adicional. |

La comprobación usa `readExisting` y `validateFicha`: verifica estructura, identidad e invariantes registrados, **no realiza ni certifica la validación editorial**. Tampoco vuelve a leer el documento científico, contrasta el TSV activo ni consulta un resumen mensual para acreditar una inclusión ya registrada. `PENDIENTE` e `INCLUIDO` conservan su significado relativo a la síntesis mensual. Este procesador no cambia `estado`, no escribe `validacion`, no genera resúmenes ni admite `--force`.

Después de invocar al generador, vuelve a leer y validar su archivo efectivo; no alcanza con que la llamada retorne. Rechaza resultados ausentes, estados discordantes o éxitos sin persistencia. Si el generador no puede guardar el diagnóstico, se informa ese fallo sin afirmar que quedó un `ERROR` persistido. Un archivo que se corrompa entre la comprobación inicial y la lectura del generador conserva las garantías de este último: ficha original intacta y diagnóstico separado en `historial/`, cuya persistencia también se verifica.

El procesador no crea ni retira locks. La comprobación definitiva previa a generar sigue dentro del `.lock` del generador. Si otra ejecución termina entre la lectura inicial y la invocación, se admite el resultado `skipped` validado. Un bloqueo existente impide iniciar otra generación y se informa como fallo; no hay espera, reintento automático del lock ni eliminación de bloqueos activos. La reutilización es una lectura del registro vigente, sin adquirir un bloqueo adicional.

La CLI informa ficha nueva, ERROR reintentado, ficha reutilizada o generación/reintento fallido. Devuelve `0` en éxito, reutilización o ayuda; `2` por argumentos inválidos; `1` por otros fallos. Ayuda sin efectos:

```bash
node scripts/fichas/procesar-ficha.mjs --help
```

El módulo también se importa sin efectos y exporta `processFicha({ date, url, idempotencyKey = null })`; `date` corresponde a `--fecha`. Devuelve `status` (`created`, `skipped` o `error`), `path`, `record` leído del disco y `retried`; ante un fallo persistido incluye además `error` y `preservedPath`. Cuando el generador exportó el TXT del intento, propaga su `coverageTextPath`. Estos son datos de retorno de la función, **no campos añadidos al JSON normativo**. Los fallos de entrada, lectura, bloqueo o comprobación posterior lanzan un error que la CLI traduce al código de salida correspondiente. El segundo argumento permite inyectar `env`, `runGenerator` y `read` para pruebas; la ejecución manual usa las implementaciones existentes.

## Pruebas e integración futura

```bash
npm run test:fichas
npm run lint -- scripts/fichas
```

Las pruebas usan `node:test`, documentos inequívocamente artificiales y dobles controlados de red, IA, navegador y extracción PDF. No abren Chrome, solicitan servicios externos ni leen credenciales reales. Cubren el vector SHA-256 calculado independientemente con Python, calendario/URL, contrato completo, estados, omisiones, reintentos, revisiones, `--force`, `INCLUIDO`, recuperación HTML/XML/PDF, abstracts/bloqueos/truncamientos, fragmentación e integración, errores de disco, secretos y rutas fuera del directorio de trabajo.

Las pruebas del acceso asistido cubren detección de desafíos, ausencia de navegador en accesos directos y errores genéricos, reutilización de sesión, confirmación por terminal, cancelación/cierre/señales/tiempo límite, entorno sin credenciales, persistencia de `ERROR`, cobertura posterior a Enter, locks durante la espera, reintento e idempotencia. La recuperación se integra en el generador existente; no introduce otra lógica de IA, persistencia, reintentos ni validación editorial.

También cubren respuestas con varias cabeceras `Set-Cookie` y páginas con abstract estructurado más metadatos abundantes. Las cookies permanecen en Chrome: solo se pasan al lector las cabeceras necesarias para comprobar la transferencia; no se copian valores de sesión al documento ni a los logs. La cobertura insuficiente conserva el diagnóstico específico sin consumir IA.

`retrieval.test.mjs` verifica el límite de 299/300 palabras, que abstract, metadatos y referencias no completen ese mínimo, y la aceptación de cuerpos suficientes sin secciones reconocidas o sin mención de limitaciones. `markup-layout.test.mjs` cubre contenedores y encabezados de distintos niveles, marcas semánticas y ARIA, límites del abstract, exclusión de metadatos del conteo, conservación del texto y tablas, selección entre tarjetas, aceptación con aviso y rechazo cuando falta cobertura. Verifica la persistencia y presentación del aviso en éxito, fallo y reutilización sin alterar el contrato ni promover estados.

`coverage-text.test.mjs` verifica contenido exacto del TXT, exclusiones, archivo vacío cuando no hay cuerpo evaluable, exportación anterior a IA, errores de cobertura/IA/JSON/disco, reintentos, `--force`, reutilización, permisos, rutas, nombres con milisegundos, colisiones concurrentes sin sobrescritura y ausencia de credenciales. También comprueba la presentación de la ruta en ambas CLI.

Las pruebas del procesador se incorporan mediante el patrón existente `scripts/fichas/*.test.mjs`, sin ejecutar su CLI como tarea automática de generación. Usan el generador real con recuperación e IA artificiales, almacenamiento temporal y fallos controlados. Cubren claves omitidas/suministradas, rechazo de entradas antes de efectos, todos los estados normativos, conservación byte a byte de fichas reutilizadas, trazabilidad de reintentos, verificación posterior de persistencia, carreras y locks activos, secretos, importación sin efectos y CLI desde otro directorio. No crean una síntesis mensual real ni atribuyen revisión editorial a los fixtures.

Los mocks demuestran comportamiento del software; **no demuestran calidad científica real, acceso universal a editores ni una generación integral real con Gemini**. Ambos ejecutables se importan sin efectos. El procesador importa `generateFicha({ date, url, force })` desde `scripts/fichas/generar-ficha.mjs`, sin duplicar la lógica científica. Las dependencias inyectables se usan para pruebas; la ejecución manual que necesite generar usa el recuperador y cliente Gemini reales.

Esta iteración no añade lector TSV, sincronizador, resumen mensual, cron, endpoint, interfaz React, almacenamiento remoto ni despliegue.
