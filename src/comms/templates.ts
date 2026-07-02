// codec/comms/templates.ts
//
// Core email templates — CODEC-v2-CORE spec §9.
//
// Tone rule (spec §9): member emails read like the venue, not like software.
// COPY IS PER-CLIENT, TEMPLATES ARE CORE — every template below is a plain
// function that a client instance can override wholesale via
// `ResendCommsOptions.templates`, or lightly re-skin by wrapping. The
// defaults are deliberately plain, warm, and generic.
//
// HTML is kept simple and inline-styled: single-column, system fonts, no
// framework — it renders everywhere and the venue's voice does the work.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Context shared by every member-facing template. */
export interface MemberEmailContext {
  venueName: string;
  memberEmail: string;
  /** Tier id/label when known (activated events). */
  tier?: string;
  /** "Manage your membership" href (from BillingProvider.manageUrl). */
  manageUrl?: string;
  /** Free-text "what happens next" — e.g. the first pickup date/ritual. */
  nextStep?: string;
  /** Owner/venue reply-to shown in copy. */
  contactEmail?: string;
}

export interface OwnerEmailContext {
  venueName: string;
  memberEmail: string;
  tier?: string;
  eventType: string;
  at: string;
}

export interface LaunchEmailContext {
  venueName: string;
  /** Human-readable billing start date: "billing starts {date}". */
  billingStartsOn: string;
  /** The member's signup/checkout link. */
  checkoutUrl: string;
  contactEmail?: string;
}

export type TemplateFn<C> = (ctx: C) => RenderedEmail;

export interface CoreTemplates {
  /** activated -> member: welcome + what happens next (spec §9). */
  welcome: TemplateFn<MemberEmailContext>;
  /** payment_failed -> member: friendly card-update nudge + manage link. */
  paymentFailed: TemplateFn<MemberEmailContext>;
  /** canceled -> member: graceful goodbye + "door's open". */
  goodbye: TemplateFn<MemberEmailContext>;
  /** every event -> owner notification. */
  ownerNotification: TemplateFn<OwnerEmailContext>;
  /** waitlist -> launch campaign: "billing starts {date}, here's your link". */
  launch: TemplateFn<LaunchEmailContext>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(bodyHtml: string): string {
  return (
    `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; ` +
    `margin: 0 auto; padding: 24px; color: #222; line-height: 1.6;">` +
    bodyHtml +
    `</div>`
  );
}

function p(html: string): string {
  return `<p style="margin: 0 0 16px;">${html}</p>`;
}

export const defaultTemplates: CoreTemplates = {
  welcome: (ctx) => {
    const subject = `Welcome to ${ctx.venueName}`;
    const tierLine = ctx.tier ? ` You're in: ${ctx.tier}.` : "";
    const next =
      ctx.nextStep ??
      "We'll email you before your first pickup with everything you need to know.";
    const contact = ctx.contactEmail
      ? ` Questions? Just reply, or write us at ${ctx.contactEmail}.`
      : " Questions? Just reply to this email.";
    return {
      subject,
      html: shell(
        p(`You're a member.${esc(tierLine)}`) +
          p(esc(next)) +
          p(esc(contact.trim())),
      ),
      text: `You're a member.${tierLine}\n\n${next}\n\n${contact.trim()}\n`,
    };
  },

  paymentFailed: (ctx) => {
    const subject = `${ctx.venueName} — a quick card hiccup`;
    const manage = ctx.manageUrl
      ? p(
          `<a href="${esc(ctx.manageUrl)}">Update your card or manage your membership</a>`,
        )
      : "";
    const manageText = ctx.manageUrl
      ? `Update your card or manage your membership: ${ctx.manageUrl}\n\n`
      : "";
    return {
      subject,
      html: shell(
        p(
          `Your latest membership payment didn't go through — it happens (expired ` +
            `cards, bank hiccups). Nothing is lost; your spot is safe.`,
        ) + manage + p(`If anything's confusing, just reply and we'll sort it out together.`),
      ),
      text:
        `Your latest membership payment didn't go through — it happens (expired cards, ` +
        `bank hiccups). Nothing is lost; your spot is safe.\n\n${manageText}` +
        `If anything's confusing, just reply and we'll sort it out together.\n`,
    };
  },

  goodbye: (ctx) => {
    const subject = `Thanks for being part of ${ctx.venueName}`;
    return {
      subject,
      html: shell(
        p(`Your membership is canceled — no hard feelings, and nothing else to do.`) +
          p(
            `Thank you for being part of it. The door's open whenever you'd like ` +
              `to come back.`,
          ),
      ),
      text:
        `Your membership is canceled — no hard feelings, and nothing else to do.\n\n` +
        `Thank you for being part of it. The door's open whenever you'd like to come back.\n`,
    };
  },

  ownerNotification: (ctx) => {
    const lines: Record<string, string> = {
      activated: `New member: ${ctx.memberEmail}${ctx.tier ? `, ${ctx.tier}` : ""}`,
      paused: `Member paused: ${ctx.memberEmail}`,
      resumed: `Member resumed: ${ctx.memberEmail}`,
      canceled: `Cancellation notice: ${ctx.memberEmail}`,
      payment_failed: `Payment failed: ${ctx.memberEmail} — flag for pickup-night follow-up`,
    };
    const line = lines[ctx.eventType] ?? `Member event ${ctx.eventType}: ${ctx.memberEmail}`;
    return {
      subject: `[${ctx.venueName}] ${line}`,
      html: shell(p(esc(line)) + p(esc(`At: ${ctx.at}`))),
      text: `${line}\nAt: ${ctx.at}\n`,
    };
  },

  launch: (ctx) => {
    const subject = `${ctx.venueName} — memberships are open`;
    return {
      subject,
      html: shell(
        p(`It's happening: billing starts ${esc(ctx.billingStartsOn)}.`) +
          p(
            `You're on the founding list, so here's your signup link before anyone else:`,
          ) +
          p(`<a href="${esc(ctx.checkoutUrl)}">Claim your membership</a>`) +
          (ctx.contactEmail
            ? p(esc(`Questions? Write us at ${ctx.contactEmail}.`))
            : ""),
      ),
      text:
        `It's happening: billing starts ${ctx.billingStartsOn}.\n\n` +
        `You're on the founding list, so here's your signup link before anyone else:\n` +
        `${ctx.checkoutUrl}\n` +
        (ctx.contactEmail ? `\nQuestions? Write us at ${ctx.contactEmail}.\n` : ""),
    };
  },
};
