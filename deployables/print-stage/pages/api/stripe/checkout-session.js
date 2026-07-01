import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../lib/authOptions";
import { toFileActor } from "../../../lib/auth";
import { getFileForActor, markFilePaidFromCheckoutSession } from "../../../lib/s3Files";
import { getStripe, isStripeConfigured } from "../../../lib/stripeServer.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
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

  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : null;
  const fileId = typeof req.query.file_id === "string" ? req.query.file_id : null;

  if (!sessionId || !fileId) {
    return res.status(400).json({ error: "session_id and file_id are required." });
  }

  try {
    let file = await getFileForActor(actor, fileId);
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.client_reference_id !== file.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (
      checkoutSession.payment_status === "paid" &&
      file.paymentStatus !== "paid"
    ) {
      file = await markFilePaidFromCheckoutSession(file.id, checkoutSession);
    }

    return res.status(200).json({
      file,
      checkoutSession: {
        id: checkoutSession.id,
        status: checkoutSession.status,
        payment_status: checkoutSession.payment_status,
        amount_total: checkoutSession.amount_total,
        currency: checkoutSession.currency,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve checkout session.";
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
