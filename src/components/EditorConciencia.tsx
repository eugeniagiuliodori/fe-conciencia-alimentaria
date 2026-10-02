"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type SunEditorFactory from "suneditor";
import DOMPurify from "dompurify";
import "suneditor/css/editor";
import "suneditor/css/contents";
import "./EditorConciencia.css";

// 1. TIPOS Y CONFIGURACIÓN. Esta integración usa SunEditor 3.3.3.
type EditorInstance = ReturnType<typeof SunEditorFactory.create>;
type DocumentData = { title: string; html: string };
type Draft = DocumentData & { version: 1; updatedAt: string };
type Notice = { kind: "info" | "success" | "error"; text: string };

type Props = {
  /** Una clave estable y distinta para cada borrador de tu aplicación. */
  storageKey?: string;
};

const EMPTY_DOCUMENT: DocumentData = { title: "Mis notas", html: "" };
const DEFAULT_KEY = "conciencia-alimentaria:editor:borrador:v1";

// 2. FUNCIONES AUXILIARES. Solo se ejecutan en el navegador.
function cleanHtml(html: string): string {
  // Conservamos los formatos de esta barra; descartamos código ejecutable.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "del", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "blockquote",
      "ul", "ol", "li", "a", "hr", "table", "thead", "tbody", "tfoot",
      "tr", "th", "td", "colgroup", "col",
    ],
    ALLOWED_ATTR: [
      "href", "title", "style", "colspan", "rowspan", "start", "align",
      "width", "height",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

function readHtml(editor: EditorInstance): string {
  // La biblioteca también admite varios documentos; aquí usamos solo uno.
  const value: unknown = editor.$.html.get();
  return typeof value === "string" ? value : "";
}

function destroyEditor(editor: EditorInstance | null): void {
  if (!editor) return;
  // SunEditor 3.3.3 deja dos timers de ResizeObserver pendientes al destruirse.
  // Inactivamos sus destinos SOLO en esta instancia antes de liberar su estado.
  // Este ajuste usa métodos internos: revisarlo al actualizar SunEditor.
  editor.$.ui._emitResizeEvent = () => undefined;
  editor.$.toolbar.resetResponsiveToolbar = () => undefined;
  editor.destroy();
}

function readDraft(key: string): Draft | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== "object" || value === null ||
    !("version" in value) || value.version !== 1 ||
    !("title" in value) || typeof value.title !== "string" ||
    !("html" in value) || typeof value.html !== "string" ||
    !("updatedAt" in value) || typeof value.updatedAt !== "string"
  ) {
    throw new Error("El borrador tiene un formato desconocido.");
  }
  return {
    version: 1,
    title: value.title.slice(0, 100),
    html: cleanHtml(value.html),
    updatedAt: value.updatedAt,
  };
}

function escapeHtml(text: string): string {
  const element = document.createElement("span");
  element.textContent = text;
  return element.innerHTML;
}

function downloadDocument(data: DocumentData): void {
  const title = data.title.trim() || "Mis notas";
  const filename = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mis-notas";
  // El archivo lleva su propio CSS: puede abrirse sin acceder a esta app.
  const page = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{max-width:800px;margin:40px auto;padding:0 24px;font:17px/1.65 system-ui,sans-serif;color:#303d2d;background:#fffdf7;overflow-wrap:anywhere}
header{border-bottom:1px solid #d8d0be;margin-bottom:24px;color:#49633b}
header p{font-size:13px;letter-spacing:.08em}h1,h2,h3{line-height:1.25}a{color:#49633b}
table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #b5bcab;padding:8px}
blockquote{margin-left:0;padding-left:16px;border-left:3px solid #49633b}hr{border:0;border-top:1px solid #d8d0be}
@media print{body{margin:0;background:white;color:black}header{color:black}@page{margin:18mm}}
</style></head><body><header><p>CONCIENCIA ALIMENTARIA</p>
<h1>${escapeHtml(title)}</h1></header><main>${cleanHtml(data.html)}</main></body></html>`;

  const url = URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `conciencia-${filename}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  // Damos tiempo al navegador para iniciar la descarga antes de liberar la URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function EditorConciencia({ storageKey = DEFAULT_KEY }: Props) {
  // 3. ESTADO: datos que React debe reflejar en la interfaz.
  const id = useId();
  const [title, setTitle] = useState(EMPTY_DOCUMENT.title);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // REFS: la instancia externa y los valores actuales, sin recrear el editor.
  const mountRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const documentRef = useRef<DocumentData>({ ...EMPTY_DOCUMENT });
  const savedRef = useRef<DocumentData>({ ...EMPTY_DOCUMENT });
  const dirtyRef = useRef(false);

  const updateDirty = useCallback(() => {
    const current = documentRef.current;
    const saved = savedRef.current;
    const changed = current.title !== saved.title || current.html !== saved.html;
    dirtyRef.current = changed;
    setDirty(changed);
  }, []);

  // 4. ACCIONES: leemos la instancia para incluir hasta la última pulsación.
  const saveDraft = useCallback((): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const current = { ...documentRef.current, html: readHtml(editor) };
    try {
      const draft: Draft = {
        ...current,
        html: cleanHtml(current.html),
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      documentRef.current = current;
      savedRef.current = { ...current };
      updateDirty();
      setNotice({ kind: "success", text: "Borrador guardado en este navegador." });
      return true;
    } catch {
      setNotice({ kind: "error", text: "No se pudo guardar el borrador. Podés descargar el HTML para conservarlo." });
      return false;
    }
  }, [storageKey, updateDirty]);

  function handleDownload() {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      downloadDocument({ ...documentRef.current, html: readHtml(editor) });
      setNotice({ kind: "info", text: "Descarga de HTML iniciada." });
    } catch {
      setNotice({ kind: "error", text: "No se pudo iniciar la descarga. Probá nuevamente." });
    }
  }

  function handlePrint() {
    try {
      editorRef.current?.$.viewer.print();
    } catch {
      setNotice({ kind: "error", text: "No se pudo abrir la impresión. Probá nuevamente." });
    }
  }

  // 5. CICLO DE VIDA: importación en el cliente, creación y destrucción.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let instance: EditorInstance | null = null;

    async function startEditor() {
      try {
        // SunEditor usa el DOM. useEffect garantiza que ya estamos en el cliente.
        const [{ default: suneditor, plugins }, { default: es }] = await Promise.all([
          import("suneditor"),
          import("suneditor/langs/es"),
        ]);
        if (cancelled || !mount) return;
        setReady(false);
        setFailed(false);

        let initial: DocumentData = { ...EMPTY_DOCUMENT };
        let initialNotice: Notice | null = null;
        try {
          const draft = readDraft(storageKey);
          if (draft) {
            initial = { title: draft.title, html: draft.html };
            initialNotice = { kind: "info", text: "Recuperamos tu último borrador guardado." };
          }
        } catch {
          initialNotice = { kind: "error", text: "No se pudo recuperar el borrador. La edición sigue disponible." };
        }

        documentRef.current = initial;
        setTitle(initial.title);
        // Este contenedor es de React; sus hijos quedan a cargo de SunEditor.
        const textarea = document.createElement("textarea");
        mount.append(textarea);
        instance = suneditor.create(textarea, {
          lang: es,
          theme: "conciencia",
          value: initial.html,
          placeholder: "Escribí una receta, una idea o una lista para tus comidas…",
          height: "auto",
          minHeight: "340px",
          toolbar_sticky: -1,
          plugins: [plugins.blockStyle, plugins.align, plugins.list, plugins.table, plugins.link],
          buttonList: [
            ["undo", "redo"],
            ["blockStyle"],
            ["bold", "italic", "underline", "strike"],
            ["list", "align"],
            ["link", "table", "removeFormat"],
          ],
          printTemplate: '<header class="ca-print-heading">Conciencia Alimentaria</header>{{ contents }}',
          events: {
            onChange: ({ data }) => {
              if (!editorRef.current || cancelled || data === documentRef.current.html) return;
              documentRef.current.html = data;
              updateDirty();
              setNotice(null);
            },
            // También conecta el comando nativo si se agrega "save" a la barra.
            onSave: () => Promise.resolve(saveDraft()),
          },
        });

        editorRef.current = instance;
        documentRef.current.html = readHtml(instance);
        savedRef.current = { ...documentRef.current };
        updateDirty();
        const editable = mount.querySelector<HTMLElement>('[contenteditable="true"]');
        editable?.setAttribute("role", "textbox");
        editable?.setAttribute("aria-label", "Contenido de tus notas");
        editable?.setAttribute("aria-multiline", "true");
        editable?.setAttribute("aria-describedby", `${id}-help`);
        setNotice(initialNotice);
        setReady(true);
      } catch {
        if (cancelled) return;
        destroyEditor(instance);
        instance = null;
        editorRef.current = null;
        mount?.replaceChildren();
        setFailed(true);
        setNotice({ kind: "error", text: "No se pudo cargar el editor. Recargá la página para volver a intentarlo." });
      }
    }

    void startEditor();
    return () => {
      // Evita instancias duplicadas al desmontar o con Strict Mode en desarrollo.
      cancelled = true;
      editorRef.current = null;
      destroyEditor(instance);
      instance = null;
      mount.replaceChildren();
    };
  }, [id, storageKey, saveDraft, updateDirty]);

  // El navegador puede avisar antes de cerrar o recargar con cambios pendientes.
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  // 6. INTERFAZ: React organiza el panel; SunEditor administra el área editable.
  return (
    <section
      className="ca-editor"
      aria-labelledby={`${id}-heading`}
      onKeyDownCapture={(event) => {
        // Capturamos Ctrl/Cmd+S aunque la barra no tenga el botón nativo "save".
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopPropagation();
          saveDraft();
        }
      }}
    >
      <header className="ca-editor__header">
        <p className="ca-editor__eyebrow">Conciencia Alimentaria</p>
        <h2 id={`${id}-heading`}>Un espacio para tus ideas</h2>
        <p>Recetas, listas y pequeñas notas para acompañar tu alimentación.</p>
      </header>

      <div className="ca-editor__name">
        <label htmlFor={`${id}-title`}>Nombre de tus notas</label>
        <input
          id={`${id}-title`}
          type="text"
          value={title}
          maxLength={100}
          autoComplete="off"
          disabled={!ready}
          onChange={(event) => {
            const value = event.target.value;
            documentRef.current.title = value;
            setTitle(value);
            updateDirty();
            setNotice(null);
          }}
        />
      </div>

      {!ready && !failed && <p className="ca-editor__loading" role="status">Cargando el editor…</p>}
      <div className="ca-editor__mount" ref={mountRef} aria-busy={!ready && !failed} />

      <footer className="ca-editor__footer">
        <div className="ca-editor__actions" role="group" aria-label="Acciones del documento">
          <button type="button" className="ca-editor__button ca-editor__button--primary"  {...{ autoComplete: "off" }}  disabled={!ready} onClick={saveDraft}>
            Guardar borrador
          </button>
          <button type="button" className="ca-editor__button"  {...{ autoComplete: "off" }} disabled={!ready} onClick={handleDownload}>
            Descargar HTML
          </button>
          <button type="button" className="ca-editor__button"  {...{ autoComplete: "off" }} disabled={!ready} onClick={handlePrint}>
            Imprimir / PDF
          </button>
        </div>
        <p id={`${id}-help`} className="ca-editor__help">
          El borrador queda en este navegador. Para llevarte una copia, descargá el
          HTML o elegí «Guardar como PDF» en la ventana de impresión.
        </p>
        <p className="ca-editor__status" data-kind={notice?.kind ?? "info"} role="status" aria-live="polite" aria-atomic="true">
          {notice?.text ?? (ready ? (dirty ? "Tenés cambios sin guardar." : "Sin cambios pendientes.") : "")}
        </p>
      </footer>
    </section>
  );
}
