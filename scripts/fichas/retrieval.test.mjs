import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256 } from "./core.mjs";
import {
  extractMarkup,
  extractPdf,
  extractPdfPages,
  retrieveDocument,
  verifyDocument,
} from "./retrieval.mjs";
import {
  htmlDocument,
  NOW,
  paragraph,
  SECTION_DATA,
  URL,
  xmlDocument,
} from "./test-support.mjs";

const htmlResponse = (text) =>
  new Response(text, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
const retrieveHtml = (html) =>
  retrieveDocument(URL, {
    fetchImpl: async () => htmlResponse(html),
    now: () => NOW,
  });

test("HTML completo: cuerpo, metadatos, secciones y hash del texto efectivamente enviado", async () => {
  const document = await retrieveHtml(htmlDocument());
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.equal(document.metadata.fecha_publicacion_original, "2020-02-02");
  assert.equal(
    document.metadata.titulo_original,
    "Documento artificial para pruebas",
  );
  assert.equal(document.metadata.idioma_original, "es");
  assert.equal(
    document.reading.sha256_contenido_extraido,
    sha256(document.text),
  );
  assert.equal(document.reading.recuperado_en, NOW);
  assert.equal(document.reading.metodo_recuperacion, "OTRO");
  assert.ok(!document.text.includes("Navegación"));
  assert.ok(
    document.sections.some((section) => section.roles.includes("RESULTADOS")),
  );
});

test("XML JATS completo y entidades HTML preservadas", async () => {
  const document = await retrieveDocument(URL, {
    fetchImpl: async () =>
      new Response(xmlDocument(), {
        headers: { "content-type": "application/xml" },
      }),
    now: () => NOW,
  });
  assert.equal(document.reading.formato, "XML");
  assert.equal(document.metadata.fecha_publicacion_original, "2020-02-02");
  const markup = htmlDocument().replace(
    "Marca alfa 0",
    "Marca &alpha; &lt; 3 &amp; beta",
  );
  assert.ok(
    extractMarkup(markup).sections.some((section) =>
      section.text.includes("α < 3 & beta"),
    ),
  );
});

test("no confunde abstract extenso, navegación o encabezados vacíos con texto completo", async () => {
  const cases = [
    htmlDocument([["Abstract", paragraph("Solo abstract", 100)]]),
    htmlDocument(SECTION_DATA.map(([heading]) => [heading, ""])),
    `<html><body><nav>${htmlDocument()}</nav></body></html>`,
    htmlDocument()
      .replace("<article>", '<article><div id="abstract">')
      .replace("</article>", "</div></article>"),
    htmlDocument()
      .replaceAll("<h2>", "<h3>")
      .replaceAll("</h2>", "</h3>")
      .replace("</h1>", "</h1><h2>Abstract</h2>"),
    htmlDocument(SECTION_DATA.filter(([heading]) => heading !== "Methods")),
    htmlDocument(SECTION_DATA.filter(([heading]) => heading !== "References")),
  ];
  for (const text of cases)
    await assert.rejects(retrieveHtml(text), {
      code: "COBERTURA_INSUFICIENTE",
    });
});

test("truncamientos de HTML, XML y transferencia se rechazan", async () => {
  await assert.rejects(
    retrieveHtml(htmlDocument().replace("</article></body></html>", "")),
    { code: "COBERTURA_INSUFICIENTE" },
  );
  for (const xml of [
    xmlDocument().slice(0, -10),
    xmlDocument().replace("</p>", ""),
    xmlDocument().replace(
      "<body>",
      '<!ENTITY x SYSTEM "file:///etc/passwd"><body>',
    ),
  ])
    assert.throws(() => extractMarkup(xml, true), {
      code: "COBERTURA_INSUFICIENTE",
    });
  await assert.rejects(
    retrieveDocument(URL, {
      fetchImpl: async () =>
        new Response(htmlDocument(), {
          headers: { "content-type": "text/html", "content-length": "9999999" },
        }),
    }),
    { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
  );
});

test("bloqueos, paywall, contenido parcial y fallos de red", async () => {
  for (const status of [401, 403, 404, 429, 500, 206])
    await assert.rejects(
      retrieveDocument(URL, {
        fetchImpl: async () => new Response("not available", { status }),
      }),
      { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
    );
  await assert.rejects(
    retrieveHtml(
      htmlDocument().replace(
        "<article>",
        "<article>Sign in to access this article",
      ),
    ),
    { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
  );
  await assert.rejects(
    retrieveHtml("<html><title>Verify you are human</title></html>"),
    { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
  );
  await assert.rejects(
    retrieveDocument(URL, {
      fetchImpl: async () => {
        throw new Error("external error");
      },
    }),
    { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
  );
});

test("redirecciones limitadas sin solicitudes a enlaces secundarios ni ejecución de scripts", async () => {
  const calls = [];
  const document = await retrieveDocument(URL, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1)
        return new Response(null, {
          status: 302,
          headers: { location: "/fulltext" },
        });
      return htmlResponse(
        htmlDocument().replace(
          "</article>",
          '<script>throw new Error("execute");</script><a href="https://no-se-visita.invalid/">Enlace no ejecutable</a></article>',
        ),
      );
    },
  });
  assert.equal(document.resolvedUrl, "https://ejemplo.org/fulltext");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["x-goog-api-key"], undefined);
  assert.ok(!document.text.includes("execute"));
  await assert.rejects(
    retrieveDocument(URL, {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "file:///etc/passwd" },
        }),
    }),
    { code: "COBERTURA_INSUFICIENTE" },
  );
  await assert.rejects(
    retrieveDocument(URL, {
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: "/loop" } }),
    }),
    { code: "TEXTO_COMPLETO_NO_DISPONIBLE" },
  );
});

test("tablas textuales conservadas y evidencia gráfica no procesable rechazada", async () => {
  const table =
    '<table id="t1"><caption>Table 1 artificial</caption><tr><th>Marca</th><th>Valor</th></tr><tr><td>Alfa</td><td>3</td></tr></table>';
  const document = await retrieveHtml(
    htmlDocument().replace("<h2>Results</h2>", `<h2>Results</h2>${table}`),
  );
  const section = document.sections.find((section) =>
    section.roles.includes("RESULTADOS"),
  );
  assert.ok(section.tables.includes("Table 1 artificial"));
  assert.match(section.text, /Alfa 3/);
  for (const graphic of [
    '<figure><img src="evidence.png"></figure>',
    '<table><img src="table.png"></table>',
    "<math><mi>x</mi></math>",
  ])
    await assert.rejects(
      retrieveHtml(
        htmlDocument().replace("</article>", `${graphic}</article>`),
      ),
      { code: "COBERTURA_INSUFICIENTE" },
    );
});

test("PDF: páginas/localizadores reales, hash completo y herramientas sin credenciales", async () => {
  const calls = [];
  const pages = SECTION_DATA.map(([heading, text]) => `${heading}\n${text}\n`);
  const document = await extractPdf(
    Buffer.from("%PDF-1.4\nartificial\n%%EOF\n"),
    {
      run: async (command, args, options) => {
        calls.push({ command, args, options });
        if (command === "pdfinfo")
          return { stdout: "Pages: 6\nEncrypted: no\n", stderr: "" };
        if (command === "pdfimages")
          return {
            stdout: "page num type width height\n----------------\n",
            stderr: "",
          };
        assert.ok((await readFile(args.at(-2), "utf8")).startsWith("%PDF-"));
        return { stdout: `${pages.join("\f")}\f`, stderr: "" };
      },
    },
  );
  const verified = verifyDocument(document, { url: URL, now: () => NOW });
  assert.equal(verified.reading.formato, "PDF");
  assert.equal(
    verified.reading.sha256_contenido_extraido,
    sha256(verified.text),
  );
  assert.deepEqual(
    verified.sections.find((section) => section.roles.includes("RESULTADOS"))
      .pages,
    [3],
  );
  assert.equal(verified.metadata.titulo_original, null);
  assert.equal(calls[0].options.env.GEMINI_API_KEY, undefined);
  assert.equal(calls[1].command, "pdfimages");
  assert.equal(calls[2].command, "pdftotext");
});

test("PDF no procesable, sin todas las páginas o con extracción visual incierta", async () => {
  await assert.rejects(extractPdf(Buffer.from("%PDF-1.4 truncated")), {
    code: "COBERTURA_INSUFICIENTE",
  });
  await assert.rejects(
    extractPdf(Buffer.from("%PDF-1.4\n%%EOF"), {
      run: async () => {
        throw new Error("not installed");
      },
    }),
    { code: "COBERTURA_INSUFICIENTE" },
  );
  await assert.rejects(
    extractPdf(Buffer.from("%PDF-1.4\n%%EOF"), {
      run: async (command) => {
        if (command === "pdfinfo") return { stdout: "Pages: 5\n", stderr: "" };
        if (command === "pdfimages")
          return {
            stdout: "page num type width height\n----------------\n",
            stderr: "",
          };
        return { stdout: "only one page\f", stderr: "" };
      },
    }),
    { code: "COBERTURA_INSUFICIENTE" },
  );
  assert.throws(() => extractPdfPages([""]), {
    code: "COBERTURA_INSUFICIENTE",
  });
  assert.throws(() => extractPdfPages([`${paragraph("Página")} Figure 1`]), {
    code: "COBERTURA_INSUFICIENTE",
  });
  await assert.rejects(
    extractPdf(Buffer.from("%PDF-1.4\n%%EOF"), {
      run: async (command) =>
        command === "pdfinfo"
          ? { stdout: "Pages: 1\n", stderr: "" }
          : {
              stdout:
                "page num type width height\n----------------\n 1 0 image 100 100\n",
              stderr: "",
            },
    }),
    { code: "COBERTURA_INSUFICIENTE" },
  );
});
