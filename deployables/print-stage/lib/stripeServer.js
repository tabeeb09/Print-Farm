import Stripe from "stripe";

import { env } from "./env.js";

let stripeClient = null;

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {});
  }

  return stripeClient;
}
