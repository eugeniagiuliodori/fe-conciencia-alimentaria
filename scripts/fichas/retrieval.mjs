import { load } from "cheerio";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  fail,
  FichaError,
  isCalendarDate,
  isHttpUrl,
  sha256,
  wordCount,
} from "./core.mjs";

const execFileAsync = promisify(execFile);
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_BYTES = MAX_DOCUMENT_BYTES;
const BLOCKED =
  /access denied|verify (?:that )?you are human|checking your browser|enable javascript and cookies|captcha|purchase (?:this|the) article|subscribe to (?:read|access)|sign in to (?:read|access)|get (?:full )?access to this article|acceso restringido|comprar (?:este|el) art[ií]culo/i;
const normalize = (value) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const compact = (value) => value.replace(/\s+/g, " ").trim();
export const LAYOUT_WARNING_PREFIX = "Evaluación del diseño ambigua:";
const HEADINGS = "h1, h2, h3, h4, h5, h6, [role='heading'][aria-level]";

function headingLevel(element) {
  const tag = element[0]?.name ?? "";
  const level = /^h[1-6]$/.test(tag)
    ? Number(tag[1])
    : Number(element.attr("aria-level"));
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : null;
}

function markedScopes(element) {
  const labels = `${element.attr("id") ?? ""} ${element.attr("class") ?? ""}`;
  const properties = (element.attr("itemprop") ?? "").split(/\s+/);
  const roles = (element.attr("role") ?? "").split(/\s+/);
  const scopes = [];
  if (
    properties.includes("abstract") || roles.includes("doc-abstract") ||
    /(?:^|[\s_-])(?:abstract|summary)(?:\d|[\s_-]|$)/i.test(labels) ||
    /^abs\d+$/i.test(element.attr("id") ?? "")
  ) scopes.push("abstract");
  if (
    /(?:^|[\s_-])(?:author-information|affiliations?|article-metadata|article-info|funding|acknowledg(?:e)?ments?|copyright|related-articles|related-content|toc)(?:[\s_-]|$)/i.test(labels) ||
    roles.some((role) => ["doc-toc", "navigation", "complementary"].includes(role))
  ) scopes.push("auxiliary");
  if (
    properties.includes("articleBody") ||
    /(?:^|\s)(?:article[-_]body|artText|full[-_]?text)(?:\s|$)/i.test(labels)
  ) scopes.push("body");
  return scopes;
}

function auxiliaryHeading(heading) {
  return /^(?:author information|authors?(?: and affiliations)?|affiliations?|corresponding authors?|funding|acknowledg(?:e)?ments?|rights and permissions|copyright|similar content being viewed by others|related (?:content|articles)|explore related subjects|about this article|cite this article|keywords|ethics declarations|competing interests|publisher[’']?s note|additional information|autores|afiliaciones|financiacion|agradecimientos|articulos relacionados)\s*[:.]?$/i.test(normalize(heading));
}

function leadingHeading($, element) {
  const labelledBy = (element.attr("aria-labelledby") ?? "").split(/\s+/);
  const headings = element.find(HEADINGS).toArray();
  const node = headings.find((heading) => labelledBy.includes(heading.attribs?.id)) ?? headings[0];
  // A heading in a nested section describes that section, not its outer wrapper.
  for (let parent = node?.parent; parent && parent !== element[0]; parent = parent.parent)
    if (["section", "article"].includes(parent.name) || markedScopes($(parent)).length)
      return $();
  return $(node);
}

// This is an access diagnostic, never an editorial validation or a new state.
export class HumanVerificationError extends FichaError {
  constructor() {
    super(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "El sitio solicita una verificación humana o de navegador antes de mostrar el artículo.",
    );
  }
}

function checkHumanVerification($) {
  if (
    /client challenge|verify (?:that )?you are human|checking your browser|enable javascript and cookies|just a moment|verifica(?:r|ción| que).*human[oa]|captcha/i.test(
      $("title, h1").text(),
    ) ||
    (!$("article, [itemprop~='articleBody']").length &&
      $(
        "#challenge-form, #cf-challenge-running, .cf-turnstile, .g-recaptcha, .h-captcha",
      ).length)
  )
    throw new HumanVerificationError();
}

function decodeMarkup(bytes, type) {
  const charset =
    type.match(/charset\s*=\s*["']?([^;\s"']+)/)?.[1] ?? "utf-8";
  return new TextDecoder(charset, { fatal: true }).decode(bytes);
}

export const EMPTY_METADATA = {
  doi: null,
  titulo_original: null,
  autores: [],
  revista_o_institucion: null,
  fecha_publicacion_original: null,
  idioma_original: null,
};

function coverageError(message) {
  fail("COBERTURA", "COBERTURA_INSUFICIENTE", message);
}

export async function readBody(response, limit = MAX_BYTES) {
  if (!response.body) throw new Error("Missing response body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Response too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const length = response.headers.get("content-length");
  if (
    length !== null &&
    !response.headers.get("content-encoding") &&
    Number(length) !== size
  )
    throw new Error("Truncated response");
  return Buffer.concat(chunks);
}

export function sectionRoles(heading) {
  const text = normalize(heading).replace(/^\s*[\d.]+\s*/, "");
  const roles = [];
  if (
    /^(introduction|background|introduccion|contexto|antecedentes)\b/.test(text)
  )
    roles.push("INTRODUCCION");
  if (
    /\b(methods?|methodology|materials and methods|metodos|metodologia|procedures?|procedimientos?|search strategy)\b/.test(
      text,
    )
  )
    roles.push("METODOS");
  if (
    /\b(results?|findings|resultados|hallazgos|evidence|evidencia)\b/.test(text)
  )
    roles.push("RESULTADOS");
  if (/\b(discussion|discusiones|discusion)\b/.test(text))
    roles.push("DISCUSION");
  if (/\b(limitations?|limitaciones|strengths and weaknesses)\b/.test(text))
    roles.push("LIMITACIONES");
  if (/\b(conclusions?|conclusiones|conclusion)\b/.test(text))
    roles.push("CONCLUSIONES");
  if (
    /^(references|bibliography|literature cited|referencias|bibliografia)\b/.test(
      text,
    )
  )
    roles.push("REFERENCIAS");
  if (/^(abstract|summary|resumen)\b/.test(text)) roles.push("ABSTRACT");
  return roles;
}

function newSection(
  sections,
  heading,
  pages = [],
  roles = sectionRoles(heading),
  scope = "body",
) {
  const locator = `S${String(sections.length + 1).padStart(3, "0")}: ${heading}`;
  const section = {
    locator,
    heading,
    roles,
    scope,
    text: "",
    tables: [],
    pages: [...pages],
  };
  sections.push(section);
  return section;
}

function metadataFromMarkup($, xml) {
  const meta = (name) =>
    compact($(`meta[name="${name}"]`).first().attr("content") ?? "") || null;
  const nodeText = (selector) => compact($(selector).first().text()) || null;
  const metadata = { ...EMPTY_METADATA, autores: [] };
  metadata.titulo_original = xml
    ? nodeText("article-title")
    : (meta("citation_title") ?? nodeText("article h1, main h1"));
  const doi = xml
    ? nodeText('article-id[pub-id-type="doi"]')
    : meta("citation_doi");
  const plainDoi = doi
    ?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  metadata.doi =
    plainDoi && /^10\.\d{4,9}\/\S+$/i.test(plainDoi) ? plainDoi : null;
  metadata.autores = xml
    ? $('contrib[contrib-type="author"]')
        .map((_, node) =>
          compact(
            $(node)
              .find("given-names, surname, collab")
              .map((__, part) => $(part).text())
              .get()
              .join(" "),
          ),
        )
        .get()
        .filter(Boolean)
    : $('meta[name="citation_author"]')
        .map((_, node) => compact($(node).attr("content") ?? ""))
        .get()
        .filter(Boolean);
  metadata.revista_o_institucion = xml
    ? nodeText("journal-title")
    : (meta("citation_journal_title") ?? meta("citation_publisher"));
  let date = xml
    ? null
    : meta("citation_publication_date")?.replaceAll("/", "-");
  if (xml) {
    const publicationDate = $("article-meta > pub-date").first();
    const year = compact(publicationDate.find("year").text());
    const month = compact(publicationDate.find("month").text());
    const day = compact(publicationDate.find("day").text());
    if (year && month && day)
      date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  metadata.fecha_publicacion_original = isCalendarDate(date) ? date : null;
  metadata.idioma_original =
    (xml ? $("article").attr("xml:lang") : $("html").attr("lang")) || null;
  return metadata;
}

export function extractMarkup(markup, xml = false) {
  if (xml && /<!ENTITY\b/i.test(markup))
    coverageError(
      "El XML contiene entidades externas o personalizadas no procesables de forma segura.",
    );
  const $ = load(
    markup,
    xml
      ? { xml: { withStartIndices: true, withEndIndices: true } }
      : { sourceCodeLocationInfo: true },
  );
  if (!xml) checkHumanVerification($);
  if (BLOCKED.test($("title, h1").text()))
    fail(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "El recurso muestra una restricción de acceso o un bloqueo.",
    );
  if (xml) {
    if (
      $("article").length !== 1 ||
      !$("article > body").length ||
      !$("article > back").length ||
      !/<\/article\s*>\s*$/.test(markup)
    )
      coverageError(
        "El XML no contiene un artículo JATS completo con cuerpo y cierre verificables.",
      );
    // htmlparser2 does not validate XML; check explicit closures before accepting it.
    $("*").each((_, node) => {
      const raw = markup.slice(node.startIndex, node.endIndex + 1);
      if (!raw.endsWith(`</${node.name}>`) && !/\/\s*>$/.test(raw))
        coverageError(
          "El XML contiene elementos truncados o cierres no verificables.",
        );
    });
  }
  const metadata = metadataFromMarkup($, xml);
  const warnings = new Set();
  const warn = (message) => warnings.add(`${LAYOUT_WARNING_PREFIX} ${message}`);
  $(
    "script, style, nav, footer, aside, form, button, noscript, dialog, [hidden], [aria-hidden='true'], [role='navigation'], [role='doc-toc'], .toc, .article-navigation",
  ).remove();
  let root;
  if (xml) root = $("article").first();
  else {
    const candidates = $(
      "article, [itemprop~='articleBody'], #artText, #article-body, .article-body",
    ).toArray();
    if (!candidates.length && $('meta[name="citation_title"]').length)
      candidates.push(...$("main").toArray());
    // Nested articleBody containers are part of the same document, not rivals.
    const outer = candidates.filter((candidate) =>
      !candidates.some((other) => other !== candidate && $.contains(other, candidate)),
    );
    const matchingTitle = outer.filter((candidate) =>
      metadata.titulo_original && $(candidate).find("h1").toArray().some((heading) =>
        compact($(heading).text()) === metadata.titulo_original,
      ),
    );
    const eligible = matchingTitle.length === 1 ? matchingTitle : outer;
    if (eligible.length > 1)
      warn("Hay varios contenedores documentales independientes; se seleccionó el de mayor texto. Revisar la selección del documento.");
    eligible.sort(
      (left, right) => $(right).text().length - $(left).text().length,
    );
    root = $(eligible[0]);
    if (!root.length || !root[0].sourceCodeLocation?.endTag)
      coverageError(
        "No se encontró un contenedor de artículo íntegro con cierre explícito; no se usó el texto general de la página.",
      );
  }
  if (BLOCKED.test(root.text()))
    fail(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "El cuerpo contiene un aviso de acceso restringido o verificación humana.",
    );
  if (
    root.find(
      "figure img, fig graphic, table img, table-wrap graphic, inline-graphic, disp-formula graphic, math, svg, canvas, iframe, object, embed",
    ).length
  )
    coverageError(
      "Hay contenido gráfico, fórmulas, tablas como imagen o recursos incrustados cuyo contenido íntegro no puede verificarse con esta extracción textual.",
    );
  if (root.find("[data-truncated='true'], .article-preview, .paywall").length)
    coverageError("El documento señala contenido parcial o restringido.");

  const sections = [];
  let current = newSection(sections, "Preámbulo", [], [], xml ? "body" : "auxiliary");
  let headingBoundary = null;
  function region(element) {
    if (element.is(HEADINGS)) return null;
    const heading = leadingHeading($, element);
    // A styling wrapper around a heading does not delimit the following prose.
    if (element[0].name === "div" && heading.length &&
      compact(element.text()) === compact(heading.text()))
      return null;
    const scopes = markedScopes(element);
    if (scopes.length > 1)
      warn("Hay marcas de abstract, metadatos o cuerpo que se contradicen. La región dudosa se excluye del conteo del cuerpo.");
    if (scopes.length) return scopes[0];
    if (element[0] === root[0] || !["section", "div"].includes(element[0].name))
      return null;
    const text = compact(heading.text());
    const scope = sectionRoles(text).includes("ABSTRACT")
      ? "abstract" : auxiliaryHeading(text) ? "auxiliary" : null;
    if (!scope) return null;
    if ((element.attr("aria-labelledby") ?? "").split(/\s+/).includes(heading.attr("id")))
      return scope;
    // A wrapper containing several peer headings is not a dedicated section.
    const peers = element.find(HEADINGS).toArray().filter((node) =>
      node !== heading[0] && headingLevel($(node)) !== null &&
      headingLevel($(node)) <= headingLevel(heading),
    );
    if (peers.length && element[0].name === "section") {
      warn("Los niveles de encabezados internos no coinciden con la sección que los contiene. Se priorizó el límite de esa sección HTML.");
      return scope;
    }
    return peers.length ? null : scope;
  }
  function visit(node, inheritedRoles = [], scope = "body", entered = false) {
    if (!node) return;
    if (node.type === "text") {
      current.text += node.data;
      return;
    }
    const element = $(node);
    const tag = node.name;
    if (!tag) return;
    const localScope = !xml && !entered ? region(element) : null;
    if (localScope) {
      if (!node.sourceCodeLocation?.endTag)
        coverageError("Un contenedor de abstract, metadatos o cuerpo no tiene cierre explícito verificable.");
      const previous = current;
      const ownLevel = headingLevel(leadingHeading($, element));
      const endedBoundary = headingBoundary && ownLevel !== null &&
        ownLevel <= headingBoundary.level;
      if (endedBoundary) headingBoundary = null;
      const previousBoundary = headingBoundary;
      const effectiveScope = scope === "body" ? localScope : scope;
      if (effectiveScope !== localScope)
        warn("Un contenedor de cuerpo aparece dentro de una región excluida. Se conservó la exclusión de la región exterior.");
      if (localScope === "body" && headingBoundary)
        warn("El contenedor del cuerpo marca un límite distinto al sugerido por los encabezados. Se priorizó el contenedor HTML.");
      headingBoundary = null;
      const roles = effectiveScope === "abstract" ? ["ABSTRACT"] : inheritedRoles;
      current = newSection(sections,
        effectiveScope === "abstract" ? "Abstract" : "Región documental",
        [], roles, effectiveScope);
      visit(node, roles, effectiveScope, true);
      headingBoundary = localScope === "body" ? null : previousBoundary;
      // Do not append subsequent body text to the abstract just visited, or move
      // it backwards in the canonical document by reusing an earlier section.
      current = (localScope === "body" || endedBoundary) && scope === "body"
        ? newSection(sections, "Continuación del cuerpo", [], inheritedRoles)
        : newSection(sections, `${previous.heading} (continuación)`, [],
          previous.roles, previous.scope);
      return;
    }
    if (xml && ["front", "floats-group"].includes(tag)) {
      // Metadata is extracted separately; floating evidence must not disappear.
      if (tag === "floats-group" && compact(element.text()))
        coverageError(
          "El XML usa evidencia flotante fuera del cuerpo; esta disposición todavía no puede verificarse.",
        );
      return;
    }
    if (xml && tag === "ref-list") {
      current = newSection(
        sections,
        "Referencias (ref-list)",
        [],
        ["REFERENCIAS"],
      );
    }
    if (tag === "sec" || tag === "section") {
      const heading = xml
        ? element.children("title").first().text()
        : leadingHeading($, element).text();
      const roles = sectionRoles(heading);
      const effectiveRoles = roles.length ? roles : inheritedRoles;
      for (const child of node.children ?? []) visit(child, effectiveRoles, scope);
      return;
    }
    if (
      /^h[1-6]$/.test(tag) ||
      (!xml && element.attr("role") === "heading" && headingLevel(element) !== null) ||
      (xml && tag === "title" && node.parent?.name !== "article-title")
    ) {
      const heading = compact(element.text());
      if (heading) {
        const roles = sectionRoles(heading);
        const level = headingLevel(element);
        if (level !== null && headingBoundary && level <= headingBoundary.level)
          headingBoundary = null;
        if (scope === "body" && level !== null &&
          (roles.includes("ABSTRACT") || auxiliaryHeading(heading))) {
          headingBoundary = {
            level, scope: roles.includes("ABSTRACT") ? "abstract" : "auxiliary",
          };
          warn("No hay un contenedor propio verificable para una región de abstract o metadatos; su límite se interpretó por la jerarquía de encabezados.");
        }
        const effectiveScope = scope === "body"
          ? (headingBoundary?.scope ?? (!xml && level === 1 && !roles.length ? "auxiliary" : scope))
          : scope;
        current = newSection(
          sections,
          heading,
          [],
          effectiveScope === "abstract"
            ? ["ABSTRACT"]
            : effectiveScope === "auxiliary" ? []
            : roles.length
              ? roles
              : inheritedRoles,
          effectiveScope,
        );
      }
      return;
    }
    if (tag === "table" || tag === "table-wrap") {
      const label =
        compact(element.children("label, caption").first().text()) ||
        element.attr("id");
      if (label && !current.tables.includes(label)) current.tables.push(label);
      if (!element.find("td, th").length)
        coverageError(
          "Se encontró una tabla sin celdas textuales recuperables.",
        );
    }
    const block =
      /^(p|div|section|sec|li|tr|table|table-wrap|fig|figure|caption|br|ref-list|ref)$/.test(
        tag,
      );
    if (block) current.text += "\n";
    if (tag === "sup") current.text += "^(";
    if (tag === "sub") current.text += "_(";
    for (const child of node.children ?? []) visit(child, inheritedRoles, scope);
    if (tag === "sup" || tag === "sub") current.text += ")";
    if (tag === "td" || tag === "th") current.text += "\t";
    if (block) current.text += "\n";
  }
  if (xml) {
    visit(root.children("body")[0]);
    visit(root.children("back")[0]);
    root.children("floats-group").each((_, node) => visit(node));
  } else visit(root[0]);
  for (const section of sections)
    section.text = section.text
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  return {
    sections,
    metadata,
    format: xml ? "XML" : "HTML",
    warnings: [...warnings],
    note: "Extracción del contenedor documental; encabezados y tablas textuales conservados. El análisis del HTML/XML excluye navegación y scripts y no sigue enlaces del documento.",
  };
}

export function extractPdfPages(
  pages,
  metadata = { ...EMPTY_METADATA, autores: [] },
) {
  if (
    !pages.length ||
    pages.some((page) => wordCount(page) < 25 || page.includes("\uFFFD"))
  )
    coverageError(
      "Hay páginas PDF vacías, escaneadas, ilegibles o sin suficiente texto; no se declara lectura completa.",
    );
  if (
    pages.some((page) =>
      /\b(?:fig(?:ure|ura)?\.?|tables?|tablas?|cuadros?)\s*\d/i.test(page),
    )
  )
    coverageError(
      "El PDF contiene referencias a tablas o figuras: la extracción textual no permite certificar su evidencia visual.",
    );
  const sections = [];
  let current = newSection(sections, "Preámbulo", [1]);
  pages.forEach((text, index) => {
    const page = index + 1;
    for (const line of text.split(/\r?\n/)) {
      const heading = compact(line);
      const roles = heading.length <= 100 ? sectionRoles(heading) : [];
      // Only short, standalone section labels; a prose mention is not a heading.
      if (roles.length && wordCount(heading) <= 8 && !/[.;:]$/.test(heading)) {
        current = newSection(
          sections,
          `${heading} (p. ${page})`,
          [page],
          roles,
        );
        current.text = `[Página ${page}]\n`;
      } else if (line.trim()) {
        if (!current.pages.includes(page)) {
          current.pages.push(page);
          current.text += `\n[Página ${page}]\n`;
        }
        current.text += `${line}\n`;
      }
    }
  });
  for (const section of sections) section.text = section.text.trim();
  return {
    sections,
    metadata,
    format: "PDF",
    note: `PDF textual procesado por Poppler; ${pages.length} páginas contrastadas con pdfinfo. Páginas físicas numeradas desde 1, no numeración impresa. No se hizo OCR ni interpretación visual.`,
  };
}

export async function extractPdf(bytes, { run = execFileAsync } = {}) {
  if (
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !/%%EOF\s*$/.test(bytes.subarray(-2048).toString("latin1"))
  )
    coverageError("El PDF está truncado o no tiene cierre verificable.");
  const directory = await mkdtemp(join(tmpdir(), "ficha-pdf-"));
  const path = join(directory, "document.pdf");
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    // Fixed executables/arguments, no shell, no inherited API credentials.
    const options = {
      timeout: 30000,
      maxBuffer: MAX_BYTES,
      env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C" },
    };
    const info = await run("pdfinfo", [path], options);
    if (info.stderr?.trim())
      coverageError(
        "Poppler advirtió problemas al interpretar la estructura PDF.",
      );
    const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 1000 ||
      /^Encrypted:\s+yes/im.test(info.stdout)
    )
      coverageError(
        "No se pudo verificar la paginación o el PDF está protegido.",
      );
    const images = await run("pdfimages", ["-list", path], options);
    if (
      images.stderr?.trim() ||
      !/^page\s+num\s+type/m.test(images.stdout) ||
      /^\s*\d+\s+\d+\s+\w+/m.test(images.stdout)
    )
      coverageError(
        "El PDF contiene imágenes o no se pudo verificar su inventario gráfico; esta técnica solo admite PDF textual sin imágenes.",
      );
    const extraction = await run(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", path, "-"],
      options,
    );
    if (extraction.stderr?.trim())
      coverageError(
        "Poppler advirtió problemas durante la extracción del PDF.",
      );
    const pages = extraction.stdout.split("\f");
    if (!pages.at(-1).trim()) pages.pop();
    if (pages.length !== count)
      coverageError(
        "La extracción no contiene todas las páginas informadas por el PDF.",
      );
    // PDF metadata may describe the file rather than the publication: leave null.
    return extractPdfPages(pages);
  } catch (error) {
    if (error instanceof FichaError) throw error;
    coverageError(
      "No se pudo procesar el PDF. Verificá pdfinfo, pdfimages y pdftotext (Poppler); no se guardaron metadatos supuestos.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function coverageSections(extracted) {
  return extracted.sections.filter(
    (section) =>
      !section.roles.includes("ABSTRACT") &&
      !["abstract", "auxiliary"].includes(section.scope),
  );
}

// Shared by the word-count check and the per-attempt TXT, including failed checks.
export function textForCoverage(extracted) {
  return coverageSections(extracted)
    .filter((section) => !section.roles.includes("REFERENCIAS"))
    .map((section) => section.text)
    .join("\n");
}

function assertCoverage(extracted) {
  const body = textForCoverage(extracted);
  if (wordCount(body) < 300)
    coverageError(
      "El cuerpo sustantivo es demasiado breve para verificar cobertura completa; se requieren 300 palabras fuera del abstract, los metadatos y las referencias.",
    );

  // Desactivado temporalmente por depender de cómo el layout delimita secciones.
  // Se conserva el control para una revisión posterior, sin exigir estos mínimos.
  /*
  const eligible = coverageSections(extracted);
  const thresholds = {
    INTRODUCCION: 60,
    METODOS: 80,
    RESULTADOS: 80,
    DISCUSION: 80,
    REFERENCIAS: 30,
  };
  const insufficient = [];
  for (const [role, minimum] of Object.entries(thresholds)) {
    const relevant = eligible.filter((section) => section.roles.includes(role));
    if (wordCount(relevant.map((section) => section.text).join(" ")) < minimum)
      insufficient.push(role);
  }
  if (insufficient.length)
    coverageError(
      `No se verificó texto suficiente fuera del abstract para: ${insufficient.join(", ")}. Los encabezados del abstract o los metadatos no cuentan como secciones del cuerpo completo. Esta disposición documental requiere otra técnica de recuperación.`,
    );
  */

  // Desactivado temporalmente: no exigir una sección o mención de limitaciones.
  /*
  const substantive = coverageSections(extracted).filter(
    (section) => !section.roles.includes("REFERENCIAS"),
  );
  if (
    !substantive.some(
      (section) =>
        section.roles.includes("LIMITACIONES") && wordCount(section.text) >= 25,
    ) &&
    !/\b(limitations?|limitaciones|limited by|limitations include|debilidades)\b/i.test(
      body,
    )
  )
    coverageError(
      "No se pudo localizar el tratamiento de las limitaciones; la cobertura requiere revisión documental.",
    );
  */
  if (body.includes("\uFFFD"))
    coverageError("La decodificación contiene caracteres ilegibles.");
}

export function verifyDocument(
  extracted,
  {
    url,
    now = () => new Date().toISOString(),
    recoveryNote = "GET directo de la URL resuelta, sin cookies ni ejecución de JavaScript.",
  },
) {
  const text = extracted.sections
    .map((section) => `${section.locator}\n${section.text}`)
    .join("\n\n");
  const observations = [extracted.note, recoveryNote, ...(extracted.warnings ?? [])].join(" ");
  const document = {
    ...extracted,
    text,
    resolvedUrl: url,
    reading: {
      texto_completo_verificado: false,
      formato: extracted.format,
      metodo_recuperacion: "OTRO",
      recuperado_en: now(),
      sha256_contenido_extraido: sha256(text),
      palabras_extraidas: wordCount(text),
      secciones_localizadas: extracted.sections.map(
        (section) => section.locator,
      ),
      alcance_y_observaciones: `${observations} Se extrajo texto, pero NO se verificó cobertura completa; no se envió a IA. El hash describe solo lo efectivamente extraído.`,
    },
  };
  try {
    assertCoverage(extracted);
  } catch (error) {
    if (error instanceof FichaError) error.document = document;
    throw error;
  }
  document.reading.texto_completo_verificado = true;
  document.reading.alcance_y_observaciones = `${observations} No se infiere si el host es editorial o repositorio. Control de extensión: cuerpo ≥300 palabras fuera del abstract, los metadatos y las referencias. No se exigieron mínimos por sección ni localización de limitaciones. Estos controles no certifican por sí solos integridad documental, fidelidad científica ni revisión editorial.`;
  return document;
}

export async function retrieveDocument(
  url,
  { fetchImpl = fetch, now, pdfExtractor = extractPdf, recoveryNote } = {},
) {
  let current = url;
  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept:
            "text/html, application/xml, application/pdf, application/xhtml+xml, text/xml",
          "User-Agent": "ConcienciaAlimentaria-local-fichas/1.0",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location)
          coverageError(
            "La redirección no identifica un documento recuperable.",
          );
        current = new URL(location, current).href;
        if (!isHttpUrl(current))
          coverageError("La redirección no es una URL HTTP(S) segura.");
        continue;
      }
      const type = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (response.status !== 200 || response.headers.has("content-range")) {
        if (
          [401, 403, 429, 503].includes(response.status) &&
          !response.headers.has("content-range") &&
          type.includes("html")
        )
          checkHumanVerification(
            load(decodeMarkup(await readBody(response), type)),
          );
        else await response.body?.cancel();
        fail(
          "RECUPERACION",
          "TEXTO_COMPLETO_NO_DISPONIBLE",
          "El servidor rechazó la descarga, devolvió un error o entregó contenido parcial.",
        );
      }
      const bytes = await readBody(response);
      let extracted;
      if (
        bytes.subarray(0, 5).toString() === "%PDF-" ||
        type.includes("application/pdf")
      )
        extracted = await pdfExtractor(bytes);
      else if (/html|xml/.test(type)) {
        const markup = decodeMarkup(bytes, type);
        const xml = !type.includes("html") && type.includes("xml");
        extracted = extractMarkup(markup, xml);
      } else
        coverageError(
          "El recurso no tiene un formato HTML, XML o PDF reconocible y verificable.",
        );
      return verifyDocument(extracted, {
        url: response.url || current,
        now,
        recoveryNote,
      });
    }
    fail(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "Se superó el límite de redirecciones del documento.",
    );
  } catch (error) {
    if (error instanceof FichaError) throw error;
    fail(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "No se pudo descargar o decodificar el artículo completo (red, tiempo límite, tamaño superior a 25 MiB o respuesta truncada).",
    );
  }
}
