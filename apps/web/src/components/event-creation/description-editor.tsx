"use client";
import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, Extension, useEditor, useEditorState } from "@tiptap/react";
import { useCreationValidation } from "./creation-validation";
import StarterKit from "@tiptap/starter-kit";
import { Plugin } from "@tiptap/pm/state";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { graphemeLength, type EventLocale } from "@event-platform/shared-types";
import { descriptionEditorHtml, encodeDescription, safeDescriptionLink, sanitizeDescriptionHtml } from "../../lib/rich-description";

const words = {
  ru: { toolbar: "Форматирование описания", h1: "Заголовок 1", h2: "Заголовок 2", bold: "Жирный", italic: "Курсив", bullet: "Маркированный список", ordered: "Нумерованный список", link: "Ссылка", url: "Адрес ссылки", apply: "Применить", cancel: "Отмена", remove: "Убрать ссылку", invalid: "Введите полный адрес с https://, http:// или mailto:", limit: "Описание слишком длинное. Сократите текст или форматирование." },
  en: { toolbar: "Description formatting", h1: "Heading 1", h2: "Heading 2", bold: "Bold", italic: "Italic", bullet: "Bullet list", ordered: "Numbered list", link: "Link", url: "Link URL", apply: "Apply", cancel: "Cancel", remove: "Remove link", invalid: "Enter a full URL starting with https://, http:// or mailto:", limit: "The description is too long. Shorten the text or reduce formatting." },
  kk: { toolbar: "Сипаттаманы пішімдеу", h1: "Тақырып 1", h2: "Тақырып 2", bold: "Қалың", italic: "Көлбеу", bullet: "Маркерленген тізім", ordered: "Нөмірленген тізім", link: "Сілтеме", url: "Сілтеме мекенжайы", apply: "Қолдану", cancel: "Бас тарту", remove: "Сілтемені жою", invalid: "https://, http:// немесе mailto: арқылы толық мекенжай енгізіңіз", limit: "Сипаттама тым ұзын. Мәтінді немесе пішімдеуді қысқартыңыз." },
};

function serializeDescription(doc: ProseMirrorNode): string {
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content));
  return encodeDescription(container.innerHTML, doc.textBetween(0, doc.content.size, "\n", node => node.type.name === "hardBreak" ? "\n" : ""));
}

export function DescriptionEditor({ label, value, max, onChange, placeholder, required, locale, disabled = false, validationKey }: {
  label: string; value: string; max: number; onChange: (value: string) => void; placeholder: string; required: boolean; locale: EventLocale; disabled?: boolean; validationKey?: string | undefined;
}) {
  const validation = useCreationValidation(validationKey);
  const id = useId(), c = words[locale], dialog = useRef<HTMLDialogElement>(null);
  const selection = useRef({ from: 1, to: 1 });
  const latestChange = useRef(onChange); latestChange.current = onChange;
  const [limitError, setLimitError] = useState(false), [linkError, setLinkError] = useState(false), [linkUrl, setLinkUrl] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] }, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false,
        link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: url => safeDescriptionLink(url) !== null },
      }),
      Extension.create({
        name: "descriptionLimit",
        addProseMirrorPlugins: () => [new Plugin({ filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          const nextLength = graphemeLength(serializeDescription(transaction.doc));
          const accepted = nextLength <= max || nextLength < graphemeLength(serializeDescription(state.doc));
          queueMicrotask(() => setLimitError(!accepted));
          return accepted;
        } })],
      }),
    ],
    content: descriptionEditorHtml(value),
    editorProps: {
      attributes: { id, role: "textbox", "aria-label": label, "aria-multiline": "true", "aria-required": String(required), "aria-describedby": `${id}-count`, "data-placeholder": placeholder, class: "ticket-rich-text creation-description-input" },
      transformPastedHTML: html => sanitizeDescriptionHtml(html),
    },
    onUpdate: ({ editor: updated }) => latestChange.current(serializeDescription(updated.state.doc)),
  });
  const state = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    h1: current.isActive("heading", { level: 1 }), h2: current.isActive("heading", { level: 2 }), bold: current.isActive("bold"), italic: current.isActive("italic"),
    bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), link: current.isActive("link"), empty: current.isEmpty,
    length: graphemeLength(current.state.doc.textBetween(0, current.state.doc.content.size, "\n", node => node.type.name === "hardBreak" ? "\n" : "")),
  } : null });
  useEffect(() => {
    if (editor && value !== serializeDescription(editor.state.doc)) editor.commands.setContent(descriptionEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => { editor?.setOptions({ editorProps: { ...editor.options.editorProps, attributes: { ...editor.options.editorProps.attributes, "aria-invalid": String(limitError || validation.invalid), "aria-describedby": `${id}-count${validation.control["aria-describedby"] ? ` ${validation.control["aria-describedby"]}` : ""}` } } }); }, [editor, limitError, validation.invalid, validation.control["aria-describedby"], id]);
  function openLink() {
    if (!editor) return;
    selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setLinkUrl(editor.getAttributes("link").href ?? ""); setLinkError(false); dialog.current?.showModal();
  }
  function closeLink() { dialog.current?.close(); editor?.commands.focus(); }
  function applyLink() {
    const href = safeDescriptionLink(linkUrl);
    if (!href || !editor) { setLinkError(true); return; }
    const chain = editor.chain().focus().setTextSelection(selection.current);
    if (selection.current.from === selection.current.to && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else chain.extendMarkRange("link").setLink({ href }).run();
    closeLink();
  }
  const tools = [
    { key: "h1", label: c.h1, icon: <>H1</>, run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: c.h2, icon: <>H2</>, run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "bold", label: c.bold, icon: <strong>B</strong>, run: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", label: c.italic, icon: <em>I</em>, run: () => editor?.chain().focus().toggleItalic().run() },
    { key: "bullet", label: c.bullet, icon: <svg viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="3" /></svg>, run: () => editor?.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: c.ordered, icon: <svg viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M3 3h1v6M3 9h2M2 15c0-3 4-3 4-1 0 1-1 2-4 5h4" /></svg>, run: () => editor?.chain().focus().toggleOrderedList().run() },
    { key: "link", label: c.link, icon: <svg viewBox="0 0 24 24"><path d="m10 13 4-4m-6 5-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6m0-2 2-2a4 4 0 0 0-6-6L8 6a4 4 0 0 0 0 6" /></svg>, run: openLink },
  ] as const;
  return <div {...validation.wrapper} className="creation-field creation-description-field">
    <label htmlFor={id} className="creation-field-label mb-1 flex items-start justify-between gap-3"><span>{label}{required ? <span aria-hidden="true" className="creation-required"> *</span> : null}</span><span id={`${id}-count`} className="creation-counter">{state?.length ?? graphemeLength(value)} / {max}</span></label>
    <div className="creation-description-editor" data-empty={state?.empty ?? !value} data-invalid={limitError}>
      <div className="creation-description-toolbar" role="group" aria-label={c.toolbar}>{tools.map(tool => <button key={tool.key} type="button" disabled={!editor || disabled} aria-label={tool.label} title={tool.label} aria-pressed={state?.[tool.key] ?? false} aria-haspopup={tool.key === "link" ? "dialog" : undefined} onMouseDown={event => event.preventDefault()} onClick={tool.run}><span aria-hidden="true">{tool.icon}</span></button>)}</div>
      <EditorContent editor={editor} />
    </div>
    {validation.error}
    {limitError ? <p role="alert" className="creation-error">{c.limit}</p> : null}
    <dialog ref={dialog} aria-labelledby={`${id}-link-title`} className="creation-description-link-dialog" onCancel={() => editor?.commands.focus()}>
      <form onSubmit={event => { event.preventDefault(); applyLink(); }}>
        <h3 id={`${id}-link-title`}>{c.link}</h3>
        <label className="creation-field">{c.url}<input autoFocus className="creation-input" type="text" inputMode="url" placeholder="https://" value={linkUrl} aria-invalid={linkError} onChange={event => { setLinkUrl(event.target.value); setLinkError(false); }} /></label>
        {linkError ? <p role="alert" className="creation-error">{c.invalid}</p> : null}
        <div className="creation-description-link-actions">{state?.link ? <button className="creation-button" type="button" onClick={() => { editor?.chain().focus().setTextSelection(selection.current).extendMarkRange("link").unsetLink().run(); closeLink(); }}>{c.remove}</button> : null}<button className="creation-button" type="button" onClick={closeLink}>{c.cancel}</button><button className="creation-button creation-button-primary" type="submit">{c.apply}</button></div>
      </form>
    </dialog>
  </div>;
}
