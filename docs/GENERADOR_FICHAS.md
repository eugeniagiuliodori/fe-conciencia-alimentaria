# Generador manual de fichas científicas

Este ejecutable local implementa el [contrato editorial 1.0.0](CONTRATO_EDITORIAL_FICHAS.md). Recibe una fecha de noticia y una URL explícitas. No lee `public/fuentes.tsv`, no se ejecuta durante el build y no modifica ni publica contenido de la web.

## Instalación y configuración

Entorno utilizado: **Node.js 24.15.0**, npm 12.0.2. Desde la raíz del repositorio:

```bash
npm ci
```

La única dependencia npm añadida es **Cheerio 1.2.0**, en `devDependencies`, para analizar HTML/XML con un parser real, conservar encabezados y tablas y excluir navegación y scripts. Node no ofrece un DOM HTML/XML nativo. No se añadieron SDK de IA ni framework de pruebas: se usan `fetch`, `node:crypto`, `node:fs/promises`, `node:child_process` y `node:test`. La web no importa estos módulos. Instalar con `--omit=dev` no instala el generador completo.

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

El directorio predeterminado está ignorado por Git. Se crean archivos con modo `0600` y directorios con `0700` cuando son nuevos. No se almacenan por defecto el artículo, las notas intermedias ni las respuestas HTTP. Los PDF descargados usan un directorio temporal privado, eliminado al terminar. Las escrituras usan un temporal exclusivo en el mismo directorio, `sync()` del archivo y `rename`; un fallo de escritura no deja un JSON parcial en la ruta principal.

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

La aplicación comprueba cobertura **antes de invocar Gemini**. Hace un GET público, con hasta cinco redirecciones HTTP(S), sin cookies, sesiones, elusión de bloqueos ni navegación a enlaces del documento. Rechaza estados distintos de 200, respuestas parciales, longitud incoherente, cuerpos superiores a 25 MiB, errores de red y codificación. No ejecuta JavaScript del editor.

- **HTML:** identifica un contenedor de artículo con cierre explícito (`article`, `articleBody`, `#artText`, `#article-body`, `.article-body` o un `main` con metadatos de publicación); excluye scripts y navegación, conserva secciones y tablas textuales. Detecta avisos de bloqueo, contenido parcial y abstracts, incluso estructurados.
- **XML:** admite JATS con `article`, `body`, `back` y elementos cerrados verificables. Rechaza entidades personalizadas/externas, truncamientos y evidencia flotante no integrada. No resuelve DTD externos.
- **PDF:** verifica cabecera y cierre, descarta documentos protegidos, contrasta páginas extraídas con `pdfinfo` y exige texto legible en cada página. `pdfimages -list` debe confirmar un inventario sin imágenes rasterizadas; incluso un logotipo puede motivar un rechazo conservador. `pdftotext -layout` conserva el orden y se numeran las páginas físicas desde 1. Se rechazan advertencias de Poppler, páginas sin texto suficiente, referencias a tablas/figuras que no se pueden interpretar fiablemente y PDFs escaneados. No se hace OCR. La metadata bibliográfica PDF queda en `null`/lista vacía cuando no se puede atribuir al artículo, sin inferirla del nombre del archivo.

La verificación conservadora busca encabezados en español o inglés para introducción/contexto, método/procedimiento, resultados/evidencia, discusión y referencias finales; exige texto sustantivo por sección, al menos 600 palabras de cuerpo y tratamiento localizable de limitaciones. Los encabezados combinados son admitidos. Se conservan todos los segmentos extraídos, incluidos referencias y preámbulo. Cada subsección tiene un identificador local estable en esa extracción. El hash corresponde exactamente al texto canónico enviado al modelo, incluidos encabezados y marcadores de página; no es el hash del PDF binario.

Estas comprobaciones son estructurales: **no prueban por sí solas la fidelidad científica**. Pueden rechazar documentos legítimos breves, con otros idiomas, revisiones narrativas sin secciones metodológicas explícitas, material paginado, páginas que requieren JavaScript o diseños editoriales no reconocidos. Los gráficos, fórmulas no textuales y tablas en imagen no se dan por leídos. La ausencia de una figura sin rótulo o de un suplemento que el editor no señale no puede certificarse universalmente con un extractor textual. Para documentos no verificables se guarda `TEXTO_COMPLETO_NO_DISPONIBLE` o `COBERTURA_INSUFICIENTE`, sin sustituirlos por un abstract. Esta iteración no es un lector universal de todos los editores ni un intérprete visual de evidencia.

`metodo_recuperacion` se registra como `OTRO` para el GET directo: no se adivina si un dominio corresponde a una editorial o a un repositorio. `alcance_y_observaciones` documenta la técnica y sus límites.

## Generación y revisión editorial

Gemini solo devuelve `titulo_es`, `tipo_documento` y `analisis`. La aplicación extrae los metadatos bibliográficos verificables y construye identidad, auditoría, `lectura`, `generacion`, validación, estados y rutas. El texto del artículo es dato no confiable como instrucción. Una negativa, bloqueo, fin distinto de `STOP`, JSON malformado, campo extra o localizador inventado produce `ERROR`; no se reparan respuestas truncadas para hacerlas pasar por completas.

Se valida toda la estructura normativa, tipos, nulabilidad y estados. Los campos cuantitativos opcionales se representan como texto con magnitud, unidad y contexto, o `null`; las páginas son números físicos PDF o `null`. La síntesis debe tener entre 200 y 350 palabras y los puntos para comparación futura entre 2 y 6. Se verifica que cada hallazgo nombre una sección extraída y, cuando corresponda, una tabla o página de su inventario.

El presupuesto de contexto usa bytes UTF-8 como límite conservador frente al límite de tokens informado por el modelo, sin fingir un conteo exacto de tokens. Cuando el documento no cabe, se fragmenta conservando todo el texto y sus localizadores, se solicitan notas de cada fragmento y se hace una generación de integración final. La fragmentación puede requerir varias llamadas y cuota. No se guarda análisis si falta una sección en las notas, falla un fragmento o la integración no cabe. Nunca se recorta el documento para usar únicamente el abstract. Las notas también requieren revisión editorial: conservar los localizadores no demuestra que el modelo haya preservado correctamente todas las cifras.

Una generación correcta queda **siempre `CREADO`**. `estructura_json_ok`, `identidad_ok` y `texto_completo_ok` registran las comprobaciones efectivas. La identidad se verifica contra los argumentos recibidos; no se afirma contrastación con TSV. `trazabilidad_de_hallazgos_ok`, `coherencia_editorial_ok` y `apta_para_sintesis` permanecen en `false`, con `validada_en: null`: comprobar que existe una sección no prueba que sustente una afirmación. Tampoco se certifican automáticamente cifras, asociación/causalidad ni ausencia de contradicciones. Las observaciones explicitan la revisión pendiente.

## Procesador previo a validación editorial

`scripts/fichas/procesar-ficha.mjs` encapsula al generador existente. Es otro ejecutable **local, manual y optativo**, anterior a la revisión editorial. Recibe fecha y URL directamente; no lee `public/fuentes.tsv`. Utiliza la misma configuración y ruta privada `data/fichas/YYYY-MM/ficha_YYYY-MM-DD_<sha256>.json` (o `FICHAS_DIR`), sin introducir dependencias.

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

El módulo también se importa sin efectos y exporta `processFicha({ date, url, idempotencyKey = null })`; `date` corresponde a `--fecha`. Devuelve `status` (`created`, `skipped` o `error`), `path`, `record` leído del disco y `retried`; ante un fallo persistido incluye además `error` y `preservedPath`. Estos son datos de retorno de la función, **no campos añadidos al JSON normativo**. Los fallos de entrada, lectura, bloqueo o comprobación posterior lanzan un error que la CLI traduce al código de salida correspondiente. El segundo argumento permite inyectar `env`, `runGenerator` y `read` para pruebas; la ejecución manual usa las implementaciones existentes.

## Pruebas e integración futura

```bash
npm run test:fichas
npm run lint -- scripts/fichas
```

Las pruebas usan `node:test`, documentos inequívocamente artificiales y dobles controlados de red, IA y extracción PDF. No solicitan servicios externos ni leen credenciales reales. Cubren el vector SHA-256 calculado independientemente con Python, calendario/URL, contrato completo, estados, omisiones, reintentos, revisiones, `--force`, `INCLUIDO`, recuperación HTML/XML/PDF, abstracts/bloqueos/truncamientos, fragmentación e integración, errores de disco, secretos y rutas fuera del directorio de trabajo.

Las pruebas del procesador se incorporan mediante el patrón existente `scripts/fichas/*.test.mjs`, sin ejecutar su CLI como tarea automática de generación. Usan el generador real con recuperación e IA artificiales, almacenamiento temporal y fallos controlados. Cubren claves omitidas/suministradas, rechazo de entradas antes de efectos, todos los estados normativos, conservación byte a byte de fichas reutilizadas, trazabilidad de reintentos, verificación posterior de persistencia, carreras y locks activos, secretos, importación sin efectos y CLI desde otro directorio. No crean una síntesis mensual real ni atribuyen revisión editorial a los fixtures.

Los mocks demuestran comportamiento del software; **no demuestran calidad científica real, acceso universal a editores ni una generación integral real con Gemini**. Ambos ejecutables se importan sin efectos. El procesador importa `generateFicha({ date, url, force })` desde `scripts/fichas/generar-ficha.mjs`, sin duplicar la lógica científica. Las dependencias inyectables se usan para pruebas; la ejecución manual que necesite generar usa el recuperador y cliente Gemini reales.

Esta iteración no añade lector TSV, sincronizador, resumen mensual, cron, endpoint, interfaz React, almacenamiento remoto ni despliegue.
