"use client";
// codec/site/WaitlistForm.tsx — processor-blind (spec §8), generalized from
// the Sunset coming-soon spec §5–6.
//
// Fields: first name (required), email (required), tier-interest radio —
// ALWAYS included, it's free demand data — and an optional add-on checkbox.
// Hidden honeypot field named `company`; the server route silently drops
// submissions that fill it (this component still posts it so the server can
// check).
//
// Posts JSON to the configurable `action` endpoint. Success swaps the form
// for a confirmation block; error shows copy that never blames the user and
// NEVER clears their input.

import { useState } from "react";
import type { FormEvent } from "react";

export interface WaitlistFormProps {
  /** Endpoint the form posts to, e.g. "/api/waitlist". */
  action: string;
  /** Tier-interest radio options (always rendered — free demand data). */
  tierOptions: Array<{ id: string; label: string }>;
  /** Extra radio option for the undecided; set to null to omit. */
  notSureLabel?: string | null;
  /** Optional add-on interest checkbox, e.g. "Interested in the Reserve add-on". */
  addOnLabel?: string;
  heading?: string;
  submitLabel?: string;
  /** Copy shown after a successful signup. */
  successCopy: string;
  /** Copy shown on failure. Never blames the user. */
  errorCopy: string;
}

export function WaitlistForm({
  action,
  tierOptions,
  notSureLabel = "Not sure yet",
  addOnLabel,
  heading,
  submitLabel = "Join the list",
  successCopy,
  errorCopy,
}: WaitlistFormProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      firstName: String(data.get("firstName") ?? ""),
      email: String(data.get("email") ?? ""),
      tierInterest: String(data.get("tierInterest") ?? ""),
      addOnInterest: data.get("addOnInterest") === "on",
      company: String(data.get("company") ?? ""), // honeypot — server drops if filled
    };

    try {
      const res = await fetch(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`waitlist endpoint returned ${res.status}`);
      setStatus("success");
    } catch {
      // Error path: show the copy, keep every input exactly as typed.
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="codec-waitlist-success" role="status">
        <p>{successCopy}</p>
      </div>
    );
  }

  return (
    <form className="codec-waitlist-form" onSubmit={handleSubmit} noValidate={false}>
      {heading ? <h3 className="codec-waitlist-heading">{heading}</h3> : null}

      <label className="codec-waitlist-field">
        <span className="codec-waitlist-label">First name</span>
        <input type="text" name="firstName" autoComplete="given-name" required />
      </label>

      <label className="codec-waitlist-field">
        <span className="codec-waitlist-label">Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>

      <fieldset className="codec-waitlist-tiers">
        <legend>Which club interests you?</legend>
        {tierOptions.map((tier) => (
          <label className="codec-waitlist-tier-option" key={tier.id}>
            <input type="radio" name="tierInterest" value={tier.id} />
            <span>{tier.label}</span>
          </label>
        ))}
        {notSureLabel !== null ? (
          <label className="codec-waitlist-tier-option">
            <input type="radio" name="tierInterest" value="not-sure" />
            <span>{notSureLabel}</span>
          </label>
        ) : null}
      </fieldset>

      {addOnLabel ? (
        <label className="codec-waitlist-addon">
          <input type="checkbox" name="addOnInterest" />
          <span>{addOnLabel}</span>
        </label>
      ) : null}

      {/* Honeypot: visually hidden from humans, tempting to bots. */}
      <label
        className="codec-waitlist-honeypot"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        Company
        <input type="text" name="company" tabIndex={-1} autoComplete="off" />
      </label>

      {status === "error" ? (
        <p className="codec-waitlist-error" role="alert">
          {errorCopy}
        </p>
      ) : null}

      <button
        className="codec-waitlist-submit"
        type="submit"
        disabled={status === "sending"}
      >
        {submitLabel}
      </button>
    </form>
  );
}
