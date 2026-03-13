// src/modules/payments/types/payment.types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types for payment.service.ts + payment.controller.ts
// Fixes TS4053: "Return type cannot be named" errors.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionStatusResult {
  plan:               string;
  status:             string;
  isPremium:          boolean;
  isCoachPremium:     boolean;
  maxClients:         number;
  currentPeriodStart: Date | null;
  currentPeriodEnd:   Date | null;
  cancelAtPeriodEnd:  boolean;
  trialEnd:           Date | null;
  stripeStatus:       string | null;
}

export interface CheckoutResult {
  sessionId: string;
  url:       string;
  planName:  string;
  amount:    number;
}

export interface PortalResult {
  url: string;
}

export interface CancelResult {
  message:        string;
  effectiveDate?: Date;
}

export interface WebhookResult {
  received: boolean;
}