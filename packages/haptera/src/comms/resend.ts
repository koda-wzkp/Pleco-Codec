// haptera/comms/resend.ts
//
// Comms layer — HAPTERA-CORE spec §9. Resend via its plain REST API
// (https://resend.com/docs/api-reference) with global `fetch`; zero runtime
// dependencies.
//
// Spec §4 rule: every MemberEvent fans out to (a) a Resend action and (b) a
// notification email to the owner. That is the entire v1 "member system" —
// the processor dashboard IS the member list; Resend audiences carry comms.

import type { MemberEvent } from "../billing/provider.js";
import {
  defaultTemplates,
  type CoreTemplates,
  type RenderedEmail,
} from "./templates.js";

const RESEND_BASE_URL = "https://api.resend.com";

export interface ResendCommsOptions {
  apiKey: string;
  /** Resend Audience that carries the club's contacts. */
  audienceId: string;
  /** From address for all outbound mail, e.g. "Sunset Wine Club <club@venue.com>". */
  from: string;
  /** Owner notification address (spec §10 item 6). */
  ownerEmail: string;
  /** Used in member-facing copy: emails read like the venue, not software. */
  venueName: string;
  /** Reply-to / contact address surfaced in member copy. */
  contactEmail?: string;
  /**
   * Manage-membership href included in payment_failed nudges
   * (typically from BillingProvider.manageUrl or a static instance value).
   */
  manageUrl?: string;
  /** "What happens next" copy for welcomes — e.g. the first pickup date. */
  welcomeNextStep?: string;
  /**
   * Per-client copy overrides (spec §9: copy is per-client, templates are
   * core). Anything omitted falls back to the core default.
   */
  templates?: Partial<CoreTemplates>;
}

export class ResendComms {
  private readonly opts: ResendCommsOptions;
  private readonly templates: CoreTemplates;

  constructor(options: ResendCommsOptions) {
    this.opts = options;
    this.templates = { ...defaultTemplates, ...options.templates };
  }

  // ------------------------------------------------------------ dispatch

  /**
   * Fan a normalized MemberEvent out per spec §4 + the §9 table:
   *
   * | event          | Resend action        | member email          | owner email |
   * |----------------|----------------------|-----------------------|-------------|
   * | activated      | add contact          | welcome + next steps  | new member  |
   * | payment_failed | (none)               | card-update nudge     | flag        |
   * | canceled       | unsubscribe contact  | graceful goodbye      | notice      |
   * | paused         | unsubscribe contact  | —                     | notice      |
   * | resumed        | re-subscribe contact | —                     | notice      |
   *
   * Callers are responsible for idempotency (processors redeliver webhooks —
   * dedupe on the provider's event id before dispatching).
   */
  async dispatchMemberEvent(event: MemberEvent): Promise<void> {
    const ownerRendered = this.templates.ownerNotification({
      venueName: this.opts.venueName,
      memberEmail: event.email,
      tier: event.type === "activated" ? event.tier : undefined,
      eventType: event.type,
      at: event.at,
    });

    const memberCtx = {
      venueName: this.opts.venueName,
      memberEmail: event.email,
      manageUrl: this.opts.manageUrl,
      contactEmail: this.opts.contactEmail,
    };

    switch (event.type) {
      case "activated":
        await this.upsertContact({ email: event.email, unsubscribed: false });
        await this.sendEmail(
          event.email,
          this.templates.welcome({
            ...memberCtx,
            tier: event.tier,
            nextStep: this.opts.welcomeNextStep,
          }),
        );
        break;
      case "payment_failed":
        await this.sendEmail(event.email, this.templates.paymentFailed(memberCtx));
        break;
      case "canceled":
        await this.upsertContact({ email: event.email, unsubscribed: true });
        await this.sendEmail(event.email, this.templates.goodbye(memberCtx));
        break;
      case "paused":
        await this.upsertContact({ email: event.email, unsubscribed: true });
        break;
      case "resumed":
        await this.upsertContact({ email: event.email, unsubscribed: false });
        break;
    }

    // Owner notification for EVERY event (spec §4).
    await this.notifyOwner(ownerRendered);
  }

  // ------------------------------------------------------------ waitlist

  /**
   * Add a waitlist signup to the Resend audience (generalized from the
   * Sunset spec §6). Resend contacts have no free-text note field, so `note`
   * (tier interest, add-on interest, ...) is carried in the owner
   * notification only — call `notifyOwner` alongside, or use the convenience
   * `handleWaitlistSignup`.
   *
   * Idempotent from the caller's view: an "already exists" response from
   * Resend is treated as success.
   */
  async addWaitlistContact(input: {
    email: string;
    firstName?: string;
    note?: string;
  }): Promise<void> {
    await this.upsertContact({
      email: input.email,
      firstName: input.firstName,
      unsubscribed: false,
    });
  }

  /** Send an email to the owner notification address. */
  async notifyOwner(email: RenderedEmail): Promise<void> {
    await this.sendEmail(this.opts.ownerEmail, email);
  }

  /**
   * Convenience for client sites' waitlist routes: add the contact AND send
   * the owner a "New signup: {name} ({note})" notification, per Sunset §6.
   */
  async handleWaitlistSignup(input: {
    email: string;
    firstName?: string;
    note?: string;
  }): Promise<void> {
    await this.addWaitlistContact(input);
    const who = input.firstName ? `${input.firstName} <${input.email}>` : input.email;
    const line = `New waitlist signup: ${who}${input.note ? ` (${input.note})` : ""}`;
    await this.notifyOwner({
      subject: `[${this.opts.venueName}] ${line}`,
      html: `<p>${escapeHtml(line)}</p>`,
      text: `${line}\n`,
    });
  }

  // ------------------------------------------------------------ campaign

  /**
   * Waitlist -> launch campaign (spec §9): "billing starts {date}, here's
   * your link." Pulls the audience's subscribed contacts and sends each the
   * launch template with the checkout link chosen by `checkoutUrlFor`
   * (constant link, or per-contact if the instance tracked tier interest).
   *
   * Deliberately simple v1: sequential sends, no batching/scheduling. For a
   * large list, prefer Resend Broadcasts from the dashboard — this helper
   * exists so launch-tier engagements need zero extra tooling.
   *
   * Returns the number of emails sent.
   */
  async waitlistLaunchCampaign(input: {
    billingStartsOn: string;
    checkoutUrlFor: (contact: { email: string; firstName?: string }) => string;
    /** Dry run: render but don't send; returns would-send count. */
    dryRun?: boolean;
  }): Promise<number> {
    const contacts = await this.listContacts();
    let sent = 0;
    for (const contact of contacts) {
      if (contact.unsubscribed) continue;
      const rendered = this.templates.launch({
        venueName: this.opts.venueName,
        billingStartsOn: input.billingStartsOn,
        checkoutUrl: input.checkoutUrlFor(contact),
        contactEmail: this.opts.contactEmail,
      });
      if (!input.dryRun) {
        await this.sendEmail(contact.email, rendered);
      }
      sent++;
    }
    return sent;
  }

  /**
   * Pickup/fulfillment reminder (spec §9): "your pickup is ready {date}." Sent
   * to the audience's subscribed contacts (active members) on the fulfillment
   * schedule — OHE's roast→pickup cadence. Same deliberately-simple v1 shape as
   * the launch campaign: sequential sends, no scheduler. Trigger it manually or
   * from a cron on the roast calendar. Returns the number of emails sent.
   */
  async pickupReminderCampaign(input: {
    pickupOn: string;
    details?: string;
    /** Dry run: render but don't send; returns would-send count. */
    dryRun?: boolean;
  }): Promise<number> {
    const contacts = await this.listContacts();
    let sent = 0;
    for (const contact of contacts) {
      if (contact.unsubscribed) continue;
      const rendered = this.templates.pickupReminder({
        venueName: this.opts.venueName,
        pickupOn: input.pickupOn,
        details: input.details,
        contactEmail: this.opts.contactEmail,
      });
      if (!input.dryRun) {
        await this.sendEmail(contact.email, rendered);
      }
      sent++;
    }
    return sent;
  }

  // ---------------------------------------------------------------- REST

  private async upsertContact(input: {
    email: string;
    firstName?: string;
    unsubscribed: boolean;
  }): Promise<void> {
    // POST /audiences/{id}/contacts creates or errors on duplicates; PATCH by
    // email updates. Create first, fall back to PATCH — net effect is an
    // idempotent upsert.
    const createRes = await this.request(
      "POST",
      `/audiences/${this.opts.audienceId}/contacts`,
      {
        email: input.email,
        ...(input.firstName ? { first_name: input.firstName } : {}),
        unsubscribed: input.unsubscribed,
      },
      { allowConflict: true },
    );
    if (createRes.conflict) {
      await this.request(
        "PATCH",
        `/audiences/${this.opts.audienceId}/contacts/${encodeURIComponent(input.email)}`,
        {
          ...(input.firstName ? { first_name: input.firstName } : {}),
          unsubscribed: input.unsubscribed,
        },
      );
    }
  }

  private async listContacts(): Promise<
    Array<{ email: string; firstName?: string; unsubscribed?: boolean }>
  > {
    const res = await this.request(
      "GET",
      `/audiences/${this.opts.audienceId}/contacts`,
    );
    const data: Array<{
      email?: string;
      first_name?: string;
      unsubscribed?: boolean;
    }> = res.body?.data ?? [];
    return data
      .filter((c): c is { email: string } & typeof c => typeof c.email === "string")
      .map((c) => ({
        email: c.email,
        firstName: c.first_name,
        unsubscribed: c.unsubscribed,
      }));
  }

  private async sendEmail(to: string, email: RenderedEmail): Promise<void> {
    await this.request("POST", "/emails", {
      from: this.opts.from,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(this.opts.contactEmail ? { reply_to: this.opts.contactEmail } : {}),
    });
  }

  private async request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    opts?: { allowConflict?: boolean },
  ): Promise<{ body: any; conflict: boolean }> {
    const res = await fetch(RESEND_BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      // Resend signals an existing contact with 409 (validation errors use
      // 4xx too — only a true conflict is tolerated, and only when asked).
      if (opts?.allowConflict && res.status === 409) {
        return { body: null, conflict: true };
      }
      const text = await res.text().catch(() => "");
      throw new Error(
        `Resend API ${method} ${path} failed: ${res.status} ${res.statusText} ${text}`.trim(),
      );
    }
    const parsed = await res.json().catch(() => null);
    return { body: parsed, conflict: false };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
