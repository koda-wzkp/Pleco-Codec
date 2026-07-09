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
// Hospitality fields (all optional, all hidden by default — the zero-labor
// fulfillment mode is dealer's choice): `preferenceFields` renders per-client
// preference dropdowns (roast level, red/white only, grind by brew method,
// ...) whose first option is always the no-preference default, and
// `notesLabel` renders a free-text notes box. The owner toggles these on in
// the instance config when they want to trade labor for hospitality. No
// datastore: selections ride the signup payload and land in the owner
// notification (v1 rule — the owner's inbox is the preferences ledger).
//
// Posts JSON to the configurable `action` endpoint. Success swaps the form
// for a confirmation block; error shows copy that never blames the user and
// NEVER clears their input.

import { useState } from "react";
import type { FormEvent } from "react";

/**
 * A per-client preference dropdown (hospitality field). The rendered select
 * always leads with a no-preference option — dealer's choice is the default
 * answer, so an untouched form costs the owner zero fulfillment labor.
 */
export interface PreferenceField {
  /** Stable key, e.g. "roast", "grind", "color". */
  id: string;
  /** Visible label, e.g. "Roast preference". */
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Copy for the leading no-preference option. */
  noPreferenceLabel?: string;
}

export interface WaitlistFormProps {
  /** Endpoint the form posts to, e.g. "/api/waitlist". */
  action: string;
  /** Tier-interest radio options (always rendered — free demand data). */
  tierOptions: Array<{ id: string; label: string }>;
  /** Extra radio option for the undecided; set to null to omit. */
  notSureLabel?: string | null;
  /** Optional add-on interest checkbox, e.g. "Interested in the Reserve add-on". */
  addOnLabel?: string;
  /**
   * Hospitality dropdowns (roast level, grind, red/white only, ...).
   * Omitted = hidden = dealer's choice, the zero-labor default.
   */
  preferenceFields?: PreferenceField[];
  /** Renders a free-text notes box when set, e.g. "Anything we should know?". */
  notesLabel?: string;
  notesPlaceholder?: string;
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
  preferenceFields,
  notesLabel,
  notesPlaceholder,
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
    // Preferences: only explicit selections travel — the empty value is the
    // no-preference default and stays out of the payload entirely.
    const preferences: Record<string, string> = {};
    for (const field of preferenceFields ?? []) {
      const value = String(data.get(`pref-${field.id}`) ?? "");
      if (value) preferences[field.id] = value;
    }

    const payload = {
      firstName: String(data.get("firstName") ?? ""),
      email: String(data.get("email") ?? ""),
      tierInterest: String(data.get("tierInterest") ?? ""),
      addOnInterest: data.get("addOnInterest") === "on",
      preferences,
      notes: String(data.get("notes") ?? ""),
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

      {(preferenceFields ?? []).map((field) => (
        <label className="codec-waitlist-field codec-waitlist-preference" key={field.id}>
          <span className="codec-waitlist-label">{field.label}</span>
          <select name={`pref-${field.id}`} defaultValue="">
            <option value="">
              {field.noPreferenceLabel ?? "No preference — dealer's choice"}
            </option>
            {field.options.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {notesLabel ? (
        <label className="codec-waitlist-field codec-waitlist-notes">
          <span className="codec-waitlist-label">{notesLabel}</span>
          <textarea name="notes" rows={3} placeholder={notesPlaceholder} maxLength={500} />
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
