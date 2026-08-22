import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, ChevronDown, Clock3,
  CalendarDays, FileText, Image, IndentDecrease, IndentIncrease, Italic, Link2, List,
  ListOrdered, Paperclip, Quote, Redo2, Underline, Undo2, Upload, Video,
  Volume2, X,
} from "lucide-react";
import type { ComposeForm, SenderOption, UploadedAttachment } from "../types";
import { formatFileSize } from "../utils";

interface ComposeScreenProps {
  form: ComposeForm;
  setForm: (form: ComposeForm) => void;
  fileName: string;
  recipients: string[];
  manualRecipient: string;
  setManualRecipient: (recipient: string) => void;
  addManualRecipient: () => void;
  senders: SenderOption[];
  senderId: string;
  setSenderId: (senderId: string) => void;
  readLeadFile: (event: ChangeEvent<HTMLInputElement>) => void;
  removeRecipient: (recipient: string) => void;
  attachments: UploadedAttachment[];
  uploadMedia: (event: ChangeEvent<HTMLInputElement>) => void;
  removeAttachment: (attachment: UploadedAttachment) => void;
  uploading: boolean;
  onBack: () => void;
  onSubmit: (event: FormEvent) => void;
  saving: boolean;
  showSendLater: boolean;
  setShowSendLater: (show: boolean) => void;
}

const visibleRecipientCount = 3;

function AttachmentIcon({ contentType }: Pick<UploadedAttachment, "contentType">) {
  if (contentType.startsWith("image/")) return <Image size={15} />;
  if (contentType.startsWith("video/")) return <Video size={15} />;
  if (contentType.startsWith("audio/")) return <Volume2 size={15} />;
  return <FileText size={15} />;
}

export function ComposeScreen({
  form, setForm, fileName, recipients, manualRecipient, setManualRecipient,
  addManualRecipient, senders, senderId, setSenderId, readLeadFile, removeRecipient,
  attachments, uploadMedia, removeAttachment, uploading, onBack, onSubmit,
  saving, showSendLater, setShowSendLater,
}: ComposeScreenProps) {
  const leadFileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  function updateToolbarState() {
    const selectionNode = document.getSelection()?.anchorNode;
    const block = selectionNode instanceof Element ? selectionNode.closest("blockquote") : selectionNode?.parentElement?.closest("blockquote");
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      blockquote: Boolean(block),
    });
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setForm({ ...form, body: editorRef.current?.innerHTML ?? "" });
    updateToolbarState();
  }

  function preventToolbarBlur(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function insertLink() {
    const url = window.prompt("Paste a web address");
    if (!url) return;
    const href = /^https?:\/\//i.test(url) || /^mailto:/i.test(url) ? url : `https://${url}`;
    runCommand("createLink", href);
  }

  const visibleRecipients = showAllRecipients ? recipients : recipients.slice(0, visibleRecipientCount);
  const overflowCount = recipients.length - visibleRecipients.length;
  const suggestedTimes = [10, 11, 15].map((hour) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);
    return { label: `Tomorrow, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00` };
  });
  const selectedDateLabel = form.startTime
    ? new Date(form.startTime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Pick date & time";

  return (
    <div className="compose-page">
      <header className="compose-header">
        <button type="button" onClick={onBack} className="back-button"><ArrowLeft size={18} />Compose New Email</button>
        <div className="compose-actions">
          <button type="button" className="paperclip-button" aria-label="Attach media or files" onClick={() => mediaFileRef.current?.click()}><Paperclip size={18} />{attachments.length > 0 ? <b>{attachments.length}</b> : null}</button>
          <button type="button" aria-label="Schedule send" onClick={() => setShowSendLater(!showSendLater)}><Clock3 size={18} /></button>
          <button type="submit" form="compose-email" className="send-button" disabled={saving || uploading}>{saving ? "Scheduling..." : "Send Later"}</button>
        </div>
      </header>

      <form id="compose-email" className="compose-form" onSubmit={onSubmit}>
        <div className="compose-fields">
          <label className="from-field">
            <span>From</span>
            <span className="sender-select-wrap">
              <select aria-label="Sender" className="from-pill" value={senderId} onChange={(event) => setSenderId(event.target.value)} disabled={senders.length === 0}>
                {senders.length === 0 ? <option>Loading senders...</option> : null}
                {senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.email}</option>)}
              </select>
              <ChevronDown size={12} aria-hidden="true" />
            </span>
          </label>

          <div className="recipient-field">
            <span>To</span>
            <div className="recipient-input-wrap">
              {visibleRecipients.map((recipient) => <span className="recipient-chip" key={recipient}><span>{recipient}</span><button type="button" aria-label={`Remove ${recipient}`} onClick={() => removeRecipient(recipient)}><X size={11} /></button></span>)}
              {!showAllRecipients && overflowCount > 0 ? <button type="button" className="recipient-chip recipient-overflow" title="Show all recipients" onClick={() => setShowAllRecipients(true)}>+{overflowCount}</button> : null}
              <input value={manualRecipient} onChange={(event) => setManualRecipient(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); addManualRecipient(); }
              }} onBlur={addManualRecipient} placeholder={recipients.length ? "Add recipient" : "recipient@example.com"} aria-label="Recipient email address" />
            </div>
            <button type="button" className="upload-list-button" onClick={() => leadFileRef.current?.click()}><Upload size={14} />Upload List</button>
          </div>

          <label><span>Subject</span><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" /></label>
          <div className="compose-controls">
            <label>Delay between 2 emails<input type="number" min={0} value={form.delaySeconds} onChange={(event) => setForm({ ...form, delaySeconds: Number(event.target.value) })} /></label>
            <label>Hourly Limit<input type="number" min={1} value={form.hourlyLimit} onChange={(event) => setForm({ ...form, hourlyLimit: Number(event.target.value) })} /></label>
          </div>
        </div>

        <section className="editor" aria-label="Email message editor">
          <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
            <button type="button" aria-label="Undo" title="Undo" onMouseDown={preventToolbarBlur} onClick={() => runCommand("undo")}><Undo2 size={16} /></button>
            <button type="button" aria-label="Redo" title="Redo" onMouseDown={preventToolbarBlur} onClick={() => runCommand("redo")}><Redo2 size={16} /></button>
            <span className="toolbar-divider" />
            <button type="button" aria-label="Heading" title="Heading" onMouseDown={preventToolbarBlur} onClick={() => runCommand("formatBlock", "h2")}><span className="toolbar-heading">Tt</span></button>
            <button type="button" className={activeFormats.bold ? "toolbar-active" : ""} aria-label="Bold" title="Bold" onMouseDown={preventToolbarBlur} onClick={() => runCommand("bold")}><Bold size={16} /></button>
            <button type="button" className={activeFormats.italic ? "toolbar-active" : ""} aria-label="Italic" title="Italic" onMouseDown={preventToolbarBlur} onClick={() => runCommand("italic")}><Italic size={16} /></button>
            <button type="button" className={activeFormats.underline ? "toolbar-active" : ""} aria-label="Underline" title="Underline" onMouseDown={preventToolbarBlur} onClick={() => runCommand("underline")}><Underline size={16} /></button>
            <span className="toolbar-divider" />
            <button type="button" aria-label="Align left" title="Align left" onMouseDown={preventToolbarBlur} onClick={() => runCommand("justifyLeft")}><AlignLeft size={16} /></button>
            <button type="button" aria-label="Align center" title="Align center" onMouseDown={preventToolbarBlur} onClick={() => runCommand("justifyCenter")}><AlignCenter size={16} /></button>
            <button type="button" aria-label="Align right" title="Align right" onMouseDown={preventToolbarBlur} onClick={() => runCommand("justifyRight")}><AlignRight size={16} /></button>
            <span className="toolbar-divider" />
            <button type="button" className={activeFormats.insertOrderedList ? "toolbar-active" : ""} aria-label="Numbered list" title="Numbered list" onMouseDown={preventToolbarBlur} onClick={() => runCommand("insertOrderedList")}><ListOrdered size={16} /></button>
            <button type="button" className={activeFormats.insertUnorderedList ? "toolbar-active" : ""} aria-label="Bulleted list" title="Bulleted list" onMouseDown={preventToolbarBlur} onClick={() => runCommand("insertUnorderedList")}><List size={16} /></button>
            <button type="button" aria-label="Decrease indent" title="Decrease indent" onMouseDown={preventToolbarBlur} onClick={() => runCommand("outdent")}><IndentDecrease size={16} /></button>
            <button type="button" aria-label="Increase indent" title="Increase indent" onMouseDown={preventToolbarBlur} onClick={() => runCommand("indent")}><IndentIncrease size={16} /></button>
            <button type="button" className={activeFormats.blockquote ? "toolbar-active" : ""} aria-label="Quote" title="Quote" onMouseDown={preventToolbarBlur} onClick={() => runCommand("formatBlock", "blockquote")}><Quote size={16} /></button>
            <button type="button" aria-label="Add link" title="Add link" onMouseDown={preventToolbarBlur} onClick={insertLink}><Link2 size={16} /></button>
          </div>
          <div ref={editorRef} className="editor-content" contentEditable role="textbox" aria-multiline="true" data-placeholder="Type Your Reply..." suppressContentEditableWarning onInput={(event) => { setForm({ ...form, body: event.currentTarget.innerHTML }); updateToolbarState(); }} onKeyUp={updateToolbarState} onMouseUp={updateToolbarState} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const selectionNode = document.getSelection()?.anchorNode;
            const blockquote = selectionNode instanceof Element ? selectionNode.closest("blockquote") : selectionNode?.parentElement?.closest("blockquote");
            if (blockquote && blockquote.textContent?.trim() === "") {
              event.preventDefault();
              runCommand("formatBlock", "div");
            }
          }} />
        </section>

        <div className="attachment-zone">
          <button type="button" className="media-upload-button" onClick={() => mediaFileRef.current?.click()} disabled={uploading}><Paperclip size={15} />{uploading ? "Uploading..." : "Attach media or files"}</button>
          <span>8 MB per file · 25 MB per email</span>
          {attachments.length > 0 ? <div className="attachment-list" aria-label="Attachments">
            {attachments.map((attachment) => <div className="attachment-card" key={attachment.id}>
              {attachment.previewUrl ? <img className="attachment-preview" src={attachment.previewUrl} alt="" /> : <AttachmentIcon contentType={attachment.contentType} />}
              <span><strong>{attachment.fileName}</strong><small>{formatFileSize(attachment.sizeBytes)}</small></span>
              <button type="button" aria-label={`Remove ${attachment.fileName}`} onClick={() => void removeAttachment(attachment)}><X size={14} /></button>
            </div>)}
          </div> : null}
        </div>

        <div className="lead-upload-status"><Upload size={15} /><span>{fileName || "Upload a CSV or TXT lead list"}</span><small aria-live="polite">{recipients.length ? `${recipients.length} email addresses detected` : "Add at least one recipient"}</small></div>
        <input ref={leadFileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readLeadFile} hidden />
        <input ref={mediaFileRef} type="file" multiple onChange={uploadMedia} hidden />

        {showSendLater && <div className="send-later" role="dialog" aria-label="Schedule send"><strong>Send Later</strong><label className={`send-later-picker ${form.startTime ? "has-selection" : ""}`}><span>{form.startTime ? `Selected: ${selectedDateLabel}` : "Pick date & time"} <CalendarDays size={18} /></span><input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><div className="send-later-suggestions">{suggestedTimes.map((suggestion) => <button type="button" key={suggestion.value} onClick={() => setForm({ ...form, startTime: suggestion.value })}>{suggestion.label}</button>)}</div><div className="send-later-actions"><button type="button" className="send-later-cancel" onClick={() => setShowSendLater(false)}>Cancel</button><button type="button" onClick={() => setShowSendLater(false)}>Done</button></div></div>}
        <button className="mobile-send" disabled={saving || uploading}>{saving ? "Scheduling..." : "Schedule emails"}</button>
      </form>
    </div>
  );
}
