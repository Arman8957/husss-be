// src/modules/payments/types/payment.types.ts
// Shared return-type interfaces.
// Import with `import type { ... }` in service/controller to satisfy
// isolatedModules + emitDecoratorMetadata requirements.

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

export interface SetupIntentResult {
  customerId:              string;
  setupIntentClientSecret: string;
  ephemeralKey:            string;
  publishableKey:          string;
}

export interface MobileSubscribeResult {
  subscriptionId:   string;
  status:           string;          // 'active' | 'requires_action' | 'trialing' | 'incomplete'
  clientSecret:     string | null;   // only present when status='requires_action'
  plan:             string;
  currentPeriodEnd: Date | null;
  message:          string;
}


export interface ConfirmPaymentResult {
  success:  boolean;
  status:   string;
  message:  string;
}

export interface PaymentMethodItem {
  id:        string;
  brand:     string;
  last4:     string;
  expMonth:  number;
  expYear:   number;
  isDefault: boolean;
}

export interface PaymentMethodsResult {
  paymentMethods:         PaymentMethodItem[];
  defaultPaymentMethodId: string | null;
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

// export interface CreateIntentResult {
//   clientSecret:   string;   // → Flutter: Stripe.instance.initPaymentSheet(clientSecret)
//   customerId:     string;   // Stripe customer ID
//   ephemeralKey:   string;   // For Payment Sheet customer session
//   publishableKey: string;   // pk_test_... or pk_live_...
//   amount:         number;   // e.g. 2999 (cents)
//   currency:       string;   // 'usd'
//   planName:       string;   // 'Monthly Premium'
//   planId:         string;   // DB plan config ID
//   priceUSD:       number;   // 29.99
// }

export type CreateIntentResult = {
  clientSecret: string | null;           // ← Allow null
  customerId: string;
  ephemeralKey: string;
  publishableKey: string;
  amount: number;
  currency: string;
  planName: string;
  planId: string;
  priceUSD: number;
  subscriptionId?: string;
  requiresPayment?: boolean;
  status?: string;
};