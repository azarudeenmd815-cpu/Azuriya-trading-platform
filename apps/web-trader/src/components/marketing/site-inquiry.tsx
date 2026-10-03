"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  EnvelopeSimple,
} from "@phosphor-icons/react";

export function SiteInquiry() {
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setDraft(
      `Azuriya inquiry — ${form.get("topic")}\n\nName: ${form.get("name")}\nReply email: ${form.get("email")}\n\n${form.get("message")}`,
    );
    setFeedback("Your inquiry draft is ready. It has not been sent.");
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setFeedback(
        "Inquiry copied. You can share it with your Azuriya contact.",
      );
    } catch {
      setFeedback(
        "Clipboard access is unavailable. Select and copy the draft below.",
      );
    }
  }
  return (
    <section className="sp-inquiry" aria-labelledby="inquiry-title">
      <div className="sp-inquiry-intro">
        <span className="sp-eyebrow">START WITH YOUR SCOPE</span>
        <h2 id="inquiry-title">Tell us what you’re building.</h2>
        <p>
          Prepare a clear brief for your brokerage, prop firm or community
          workspace.
        </p>
        <div className="sp-inquiry-note">
          <EnvelopeSimple size={23} />
          <div>
            <strong>A local inquiry draft</strong>
            <p>
              This form prepares text on your device. It does not submit an
              inquiry or subscribe you to emails. The operator’s contact channel
              is awaiting confirmation.
            </p>
          </div>
        </div>
      </div>
      <form onSubmit={prepare} className="sp-inquiry-form">
        <div className="sp-form-pair">
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              placeholder="Full name"
            />
          </label>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@company.com"
            />
          </label>
        </div>
        <label>
          What would you like to discuss?
          <select name="topic">
            <option>Influencer & community solution</option>
            <option>Brokerage infrastructure</option>
            <option>Prop firm operations</option>
            <option>MT5 funding configuration</option>
            <option>Platform & liquidity connections</option>
            <option>Privacy or policy question</option>
          </select>
        </label>
        <label>
          Tell us about your operation
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            placeholder="Your audience, preferred platforms, team size and launch requirements…"
          />
        </label>
        <button className="az-button" type="submit">
          Prepare inquiry <ArrowRight size={17} />
        </button>
        <p className="sp-form-caption">
          Avoid passwords, API keys, payment details or account credentials.
        </p>
      </form>
      {draft && (
        <div className="sp-inquiry-draft">
          <div>
            <h3>
              <CheckCircle size={20} /> Your prepared inquiry
            </h3>
            <button type="button" onClick={copyDraft}>
              <Copy size={17} /> Copy draft
            </button>
          </div>
          <pre tabIndex={0}>{draft}</pre>
        </div>
      )}
      <p role="status" className="sp-inquiry-feedback">
        {feedback}
      </p>
    </section>
  );
}
