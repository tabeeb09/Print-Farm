import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { env } from "../../../../lib/env";
import { toFileActor } from "../../../../lib/auth";
import { getFileForActor, markPaymentSessionPending } from "../../../../lib/s3Files";
import { getStripe, isStripeConfigured } from "../../../../lib/stripeServer.js";

function getBaseUrl() {
  return env.APP_BASE_URL || env.NEXTAUTH_URL || "https://print.loftrop.com";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!isStripeConfigured()) {
    return res.status(500).json({ error: "Stripe is not configured." });
  }

  try {
    const file = await getFileForActor(actor, req.query.id);

    if (file.paymentStatus === "paid") {
      return res.status(200).json({ alreadyPaid: true, file });
    }

    if (!file.paymentQuote?.lineItems?.length) {
      throw new Error("A payment quote is not available for this file yet.");
    }

    const baseUrl = getBaseUrl();
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/print-payment/success?session_id={CHECKOUT_SESSION_ID}&file_id=${encodeURIComponent(file.id)}`,
      cancel_url: `${baseUrl}/files?payment=cancelled&file_id=${encodeURIComponent(file.id)}`,
      client_reference_id: file.id,
      customer_email: actor.email || undefined,
      metadata: {
        fileId: file.id,
        ownerSub: file.ownerSub,
        originalFilename: file.originalFilename,
      },
      payment_intent_data: {
        metadata: {
          fileId: file.id,
          ownerSub: file.ownerSub,
          originalFilename: file.originalFilename,
        },
      },
      line_items: file.paymentQuote.lineItems.map((lineItem) => ({
        quantity: 1,
        price_data: {
          currency: lineItem.currency,
          unit_amount: lineItem.amountMinor,
          product_data: {
            name: `${lineItem.label} filament`,
            description: `${lineItem.grams.toFixed(2)} g @ ${(lineItem.unitAmountMinorPerGram / 100).toFixed(2)} ${lineItem.currency.toUpperCase()}/g`,
          },
        },
      })),
    });

    await markPaymentSessionPending(actor, file.id, checkoutSession);

    return res.status(200).json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session.";
    const status =
      message === "File not found."
        ? 404
        : message === "Forbidden"
          ? 403
          : message.includes("configured")
            ? 500
            : 400;
    return res.status(status).json({ error: message });
  }
}
