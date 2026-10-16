/**
 * Order notifications (email + SMS).
 *
 * Right now both are SIMULATED: nothing leaves the server, we just log the
 * message that WOULD have been sent and mark the order as notified, so the
 * whole checkout flow works end to end.
 *
 * ── HOW TO SWITCH ON REAL SENDING ───────────────────────────────────────────
 * EMAIL: once you own a domain and it is verified as your sending domain,
 *   1. set EMAIL_MODE = "live" below
 *   2. uncomment the block inside sendOrderEmail marked "REAL EMAIL"
 *      (it uses the app's email templates + Lovable managed sending)
 *
 * SMS: once you have an account with a Ghanaian SMS provider
 *   (Arkesel or Hubtel), set SMS_MODE = "live" and fill in the fetch call
 *   inside sendOrderSms marked "REAL SMS" with your provider's endpoint,
 *   reading the API key from process.env inside the function.
 * ────────────────────────────────────────────────────────────────────────────
 */

const EMAIL_MODE: "simulated" | "live" = "simulated";
const SMS_MODE: "simulated" | "live" = "simulated";

export type OrderNotification = {
  orderRef: string;
  buyerName: string;
  email: string;
  phone: string;
  total: number;
  paymentMethod: string;
  receiptUrl: string;
  items: { title: string; author: string | null; quantity: number; unitPrice: number }[];
};

const cedis = (amount: number) =>
  `GH\u20B5 ${Number(amount ?? 0).toFixed(2)}`;

export function buildOrderEmail(order: OrderNotification) {
  const lines = order.items
    .map((i) => `- ${i.title}${i.author ? ` by ${i.author}` : ""} x${i.quantity} — ${cedis(i.unitPrice * i.quantity)}`)
    .join("\n");

  return {
    subject: `Your BookMarket Ghana receipt — ${order.orderRef}`,
    text: [
      `Hi ${order.buyerName},`,
      ``,
      `We received your payment. Here is your receipt.`,
      ``,
      `Order: ${order.orderRef}`,
      `Payment method: ${order.paymentMethod}`,
      lines,
      `Total paid: ${cedis(order.total)}`,
      ``,
      `View or print your receipt: ${order.receiptUrl}`,
      ``,
      `Thank you for buying with BookMarket Ghana.`,
    ].join("\n"),
  };
}

export function buildOrderSms(order: OrderNotification) {
  return `BookMarket Ghana: payment received for ${order.orderRef}. Total ${cedis(order.total)}. Receipt: ${order.receiptUrl}`;
}

export async function sendOrderEmail(order: OrderNotification): Promise<boolean> {
  const message = buildOrderEmail(order);

  if (EMAIL_MODE === "simulated") {
    console.info(
      `[SIMULATED EMAIL] to=${order.email}\nsubject=${message.subject}\n${message.text}`,
    );
    return true;
  }

  // ── REAL EMAIL — uncomment once your sending domain is verified ───────────
  // const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  // const result = await sendTemplateEmail("order-receipt", order.email, {
  //   templateData: { ...order },
  //   idempotencyKey: `order-receipt-${order.orderRef}`,
  // });
  // return result.sent;
  // ─────────────────────────────────────────────────────────────────────────
  return false;
}

export async function sendOrderSms(order: OrderNotification): Promise<boolean> {
  const message = buildOrderSms(order);

  if (SMS_MODE === "simulated") {
    console.info(`[SIMULATED SMS] to=${order.phone}\n${message}`);
    return true;
  }

  // ── REAL SMS — fill in with your provider once you have an account ────────
  // const apiKey = process.env['SMS_API_KEY'];
  // if (!apiKey) return false;
  // const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
  //   method: "POST",
  //   headers: { "api-key": apiKey, "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     sender: "BookMarket",
  //     message,
  //     recipients: [order.phone],
  //   }),
  // });
  // return res.ok;
  // ─────────────────────────────────────────────────────────────────────────
  return false;
}
