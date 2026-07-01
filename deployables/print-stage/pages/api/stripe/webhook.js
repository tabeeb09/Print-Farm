import Stripe from "stripe";

import { env } from "../../../lib/env";
import { markFilePaidFromCheckoutSession } from "../../../lib/s3Files";
import { getStripe, isStripeConfigured } from "../../../lib/stripeServer.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isStripeConfigured() || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "Stripe webhook is not configured." });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const checkoutSession = event.data.object;
      const fileId = checkoutSession.metadata?.fileId || checkoutSession.client_reference_id;

      if (fileId) {
        await markFilePaidFromCheckoutSession(fileId, checkoutSession);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook failed.";
    return res.status(400).json({ error: message });
  }
}
