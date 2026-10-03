"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PaperPlaneTilt, Paperclip, Smiley, X } from "@phosphor-icons/react";
import type { CommunityMessage } from "./dashboard-community-data";

export type CommunityDraft = {
  body: string;
  attachment?: CommunityMessage["attachment"];
};

export function CommunityComposer({
  channel,
  draft,
  onDraftChange,
  onSend,
  thread = false,
  disabled = false,
}: {
  channel: string;
  draft: CommunityDraft;
  onDraftChange: (draft: CommunityDraft) => void;
  onSend: (body: string, attachment?: CommunityMessage["attachment"]) => void;
  thread?: boolean;
  disabled?: boolean;
}) {
  const body = draft.body;
  const attachment = draft.attachment;
  const setDraft = (body: string | ((text: string) => string)) =>
    onDraftChange({
      ...draft,
      body: typeof body === "string" ? body : body(draft.body),
    });
  const setAttachment = (value?: CommunityMessage["attachment"]) =>
    onDraftChange({ ...draft, attachment: value });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => {
    setEmojiOpen(false);
    setFileOpen(false);
  }, [channel]);
  const send = () => {
    if (disabled || (!body.trim() && !attachment)) return;
    onSend(body.trim(), attachment);
    onDraftChange({ body: "" });
    setFileOpen(false);
    setEmojiOpen(false);
    input.current?.focus();
  };
  return (
    <div className="dc-community-composer">
      {attachment && (
        <div className="dc-community-draft-file">
          <Paperclip size={16} />
          <span>
            {attachment === "chart"
              ? "Gold session chart"
              : "Session briefing.pdf"}
          </span>
          <button
            aria-label="Remove attachment"
            onClick={() => setAttachment(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <label className="dc-community-sr" htmlFor={id}>
        {thread ? "Reply to thread" : `Message ${channel}`}
      </label>
      <textarea
        ref={input}
        id={id}
        aria-label={thread ? "Reply to thread" : `Message ${channel}`}
        value={body}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={thread ? "Reply in this thread…" : `Message ${channel}…`}
        maxLength={2000}
        rows={2}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="dc-community-composer-tools">
        <div className="dc-community-composer-options">
          <button
            aria-label={thread ? "Add thread attachment" : "Add attachment"}
            aria-expanded={fileOpen}
            onClick={() => {
              setFileOpen(!fileOpen);
              setEmojiOpen(false);
            }}
          >
            <Paperclip size={18} />
          </button>
          <button
            aria-label={thread ? "Add thread emoji" : "Add emoji"}
            aria-expanded={emojiOpen}
            onClick={() => {
              setEmojiOpen(!emojiOpen);
              setFileOpen(false);
            }}
          >
            <Smiley size={18} />
          </button>
          <span>Enter to send · Shift + Enter for a new line</span>
        </div>
        <button
          className="dc-community-send"
          aria-label={thread ? "Send thread reply" : "Send message"}
          disabled={disabled || (!body.trim() && !attachment)}
          onClick={send}
        >
          <PaperPlaneTilt size={17} />
          <span>Send</span>
        </button>
      </div>
      {fileOpen && (
        <div
          className="dc-community-compose-menu"
          aria-label="Example attachments"
        >
          <span>Choose a demo attachment</span>
          <button
            onClick={() => {
              setAttachment("chart");
              setFileOpen(false);
            }}
          >
            Annotated session chart
          </button>
          <button
            onClick={() => {
              setAttachment("file");
              setFileOpen(false);
            }}
          >
            Session briefing.pdf
          </button>
        </div>
      )}
      {emojiOpen && (
        <div className="dc-community-emoji-menu" aria-label="Emoji picker">
          {["👍", "📈", "✅", "👋", "🎯", "💬"].map((emoji) => (
            <button
              key={emoji}
              aria-label={`Insert ${emoji}`}
              onClick={() => {
                setDraft((text) => text + emoji);
                setEmojiOpen(false);
                input.current?.focus();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
