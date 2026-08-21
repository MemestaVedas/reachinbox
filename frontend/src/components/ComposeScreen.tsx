import { useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Clock3, Paperclip, Upload } from "lucide-react";
import type { ComposeForm, SenderOption } from "../types";

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
  onBack: () => void;
  onSubmit: (event: FormEvent) => void;
  saving: boolean;
  showSendLater: boolean;
  setShowSendLater: (show: boolean) => void;
}

export function ComposeScreen({
  form,
  setForm,
  fileName,
  recipients,
  manualRecipient,
  setManualRecipient,
  addManualRecipient,
  senders,
  senderId,
  setSenderId,
  readLeadFile,
  onBack,
  onSubmit,
  saving,
  showSendLater,
  setShowSendLater,
}: ComposeScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="compose-page">
      <header className="compose-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={18} />
          Compose New Email
        </button>

        <div className="compose-actions">
          <button aria-label="Attach file" onClick={() => fileRef.current?.click()}>
            <Paperclip size={18} />
          </button>
          <button
            aria-label="Schedule send"
            onClick={() => setShowSendLater(!showSendLater)}
          >
            <Clock3 size={18} />
          </button>
          <button
            className="send-button"
            onClick={() => void onSubmit(new Event("submit") as unknown as FormEvent)}
          >
            Send
          </button>
        </div>
      </header>

      <form className="compose-form" onSubmit={onSubmit}>
        <div className="compose-fields">
          <label className="flex items-center gap-8">
            From
            <select
              aria-label="Sender"
              className="from-pill border-0"
              value={senderId}
              onChange={(event) => setSenderId(event.target.value)}
              disabled={senders.length === 0}
            >
              {senders.length === 0 ? <option>Loading senders...</option> : null}
              {senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.email}</option>)}
            </select>
          </label>
          <label>
            To
            <input
              value={manualRecipient}
              onChange={(event) => setManualRecipient(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addManualRecipient();
                }
              }}
              onBlur={addManualRecipient}
              placeholder="recipient@example.com"
            />
          </label>
          <label>
            Subject{" "}
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Subject"
            />
          </label>

          <div className="compose-controls">
            <label>
              Delay between 2 emails{" "}
              <input
                type="number"
                min={0}
                value={form.delaySeconds}
                onChange={(e) => setForm({ ...form, delaySeconds: Number(e.target.value) })}
              />
            </label>
            <label>
              Hourly Limit{" "}
              <input
                type="number"
                min={1}
                value={form.hourlyLimit}
                onChange={(e) => setForm({ ...form, hourlyLimit: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>

        {/* Rich-text toolbar (decorative) */}
        <div className="editor">
          <div className="toolbar">
            ↶　↷　|　Tᵀ　⌄　 <b>B</b>　<i>I</i>　<u>U</u>　☷　☷　❝　▤
          </div>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Type Your Reply..."
          />
        </div>

        {/* Lead file upload */}
        <label className="lead-upload" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
          <span>{fileName || "Upload lead list (.csv or .txt)"}</span>
          <small aria-live="polite">
            {recipients.length
              ? `${recipients.length} email addresses detected`
              : "Required for scheduling"}
          </small>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={readLeadFile} />
        </label>

        {/* Hidden date field — always tracked in state */}
        <input
          type="datetime-local"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          className="hidden-date"
        />

        {/* Send Later popover */}
        {showSendLater && (
          <div className="send-later">
            <strong>Send Later</strong>
            <label style={{ gap: "4px" }}>
              Pick date &amp; time
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
              <span style={{ fontSize: "8px", color: "#84909a", marginTop: "2px" }}>
                Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} (Local)
              </span>
            </label>
            <button type="button" onClick={() => setShowSendLater(false)}>
              Done
            </button>
          </div>
        )}

        <button className="mobile-send" disabled={saving}>
          {saving ? "Scheduling..." : "Schedule emails"}
        </button>
      </form>
    </div>
  );
}
