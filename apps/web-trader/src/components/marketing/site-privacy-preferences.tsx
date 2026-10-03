"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, LockKey, SlidersHorizontal, X } from "@phosphor-icons/react";

const storageKey = "azuriya:privacy-preferences";

export function PrivacyPreferences() {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const [feedback, setFeedback] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    try {
      setRemember(localStorage.getItem(storageKey) !== null);
    } catch {
      setRemember(false);
    }
    dialog.current?.showModal();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const save = () => {
    try {
      if (remember)
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            optionalAnalytics: false,
            rememberPreference: true,
          }),
        );
      else localStorage.removeItem(storageKey);
      setFeedback("Privacy preference saved. Optional tracking remains off.");
      close();
    } catch {
      setFeedback(
        "Browser storage is unavailable. Optional tracking remains off.",
      );
    }
  };
  return (
    <>
      <button
        className="sf-preferences-trigger"
        onClick={() => {
          setFeedback("");
          setOpen(true);
        }}
      >
        Privacy preferences
      </button>
      <span className="sf-sr" role="status">
        {feedback}
      </span>
      {open && (
        <dialog
          ref={dialog}
          className="sf-privacy-dialog"
          aria-label="Privacy preferences"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <header>
            <span>
              <SlidersHorizontal size={20} />
              Privacy preferences
            </span>
            <button
              aria-label="Close privacy preferences"
              onClick={close}
              autoFocus
            >
              <X size={20} />
            </button>
          </header>
          <div className="sf-privacy-body">
            <p>
              Control whether this browser remembers your preference. This
              preview does not load optional analytics or advertising trackers.
            </p>
            <div className="sf-privacy-row">
              <LockKey size={20} />
              <span>
                <strong>Essential access</strong>
                <small>
                  The authenticated terminal uses a session cookie. Your chosen
                  workspace may be saved on this device.
                </small>
              </span>
              <span className="sf-setting-state">Required for sign in</span>
            </div>
            <div className="sf-privacy-row">
              <Check size={20} />
              <span>
                <strong>Optional analytics & advertising</strong>
                <small>
                  No optional tracking scripts are enabled in this preview.
                </small>
              </span>
              <span className="sf-setting-state">Not in use</span>
            </div>
            <label className="sf-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember my privacy choice on this device</span>
            </label>
            <p className="sf-privacy-note">
              This setting stores only your preference. It does not clear your
              trading workspace or sign you out.{" "}
              <Link href="/legal/cookies">Read about cookies and storage.</Link>
            </p>
            <p role="status">{feedback}</p>
            <button className="az-button" onClick={save}>
              Save preference <Check size={17} />
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
