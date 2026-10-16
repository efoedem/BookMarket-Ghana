import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CartLine = { bookId: string; quantity: number };

type PlaceOrderInput = {
  items: CartLine[];
  buyerName: string;
  phone: string;
  email: string;
};

function makeOrderRef(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const random = Math.floor(1000 + Math.random() * 9000);
  return `EKO-${date}-${time}-${random}`;
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PlaceOrderInput) => {
    const items = (input.items ?? [])
      .filter((line) => typeof line?.bookId === "string" && line.bookId.length > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Math.min(Math.max(Math.trunc(Number(line.quantity) || 1), 1), 20),
      }));
    if (items.length === 0) throw new Error("Your cart is empty.");

    const buyerName = String(input.buyerName ?? "").trim().slice(0, 120);
    const phone = String(input.phone ?? "").trim().slice(0, 20);
    const email = String(input.email ?? "").trim().toLowerCase().slice(0, 255);
    if (!buyerName) throw new Error("Please enter the name for the order.");
    if (!/^[+0-9()\s-]{9,20}$/.test(phone)) throw new Error("Please enter a valid phone number.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Please enter a valid email address.");

    return { items, buyerName, phone, email };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: books, error: booksError } = await supabase
      .from("books")
      .select("id, title, author, price")
      .in(
        "id",
        data.items.map((line) => line.bookId),
      );

    if (booksError) throw new Error("We could not load those books. Please try again.");
    if (!books || books.length === 0) throw new Error("Those books are no longer available.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("level, schools:school_id (name), departments:department_id (name)")
      .eq("id", userId)
      .maybeSingle();

    const lines = data.items
      .map((line) => {
        const book = books.find((b) => b.id === line.bookId);
        if (!book) return null;
        return {
          book_id: book.id,
          title: book.title,
          author: book.author,
          unit_price: Number(book.price),
          quantity: line.quantity,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

    const total = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        order_ref: makeOrderRef(),
        buyer_name: data.buyerName,
        phone: data.phone,
        email: data.email,
        school_name: (profile?.schools as { name: string } | null)?.name ?? null,
        department_name: (profile?.departments as { name: string } | null)?.name ?? null,
        level: profile?.level ?? null,
        total,
        status: "PENDING",
        payment_status: "UNPAID",
      })
      .select("id, order_ref")
      .single();

    if (orderError || !order) {
      console.error("placeOrder insert failed", orderError);
      throw new Error("We could not create your order. Please try again.");
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(lines.map((line) => ({ ...line, order_id: order.id })));

    if (itemsError) {
      console.error("placeOrder items insert failed", itemsError);
      throw new Error("We could not save the books on your order. Please try again.");
    }

    return { orderId: order.id, orderRef: order.order_ref, total };
  });

export const payOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; method: string }) => {
    const orderId = String(input.orderId ?? "").trim();
    const method = String(input.method ?? "").trim();
    if (!orderId) throw new Error("Missing order.");
    if (!["momo", "card"].includes(method)) throw new Error("Please choose a payment method.");
    return { orderId, method };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_ref, buyer_name, email, phone, total, payment_status")
      .eq("id", data.orderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !order) throw new Error("We could not find that order.");

    if (order.payment_status === "PAID") {
      return { ok: true, alreadyPaid: true };
    }

    const paymentMethod = data.method === "momo" ? "Mobile Money" : "Card";

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "PAID",
        status: "CONFIRMED",
        payment_method: paymentMethod,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("payOrder update failed", updateError);
      throw new Error("Payment could not be confirmed. Please try again.");
    }

    // Notifications are simulated for now — see src/lib/notify.server.ts
    try {
      const { sendOrderEmail, sendOrderSms } = await import("@/lib/notify.server");
      const { data: items } = await supabase
        .from("order_items")
        .select("title, author, quantity, unit_price")
        .eq("order_id", order.id);

      const origin = process.env['SITE_URL'] ?? "";
      const payload = {
        orderRef: order.order_ref,
        buyerName: order.buyer_name,
        email: order.email,
        phone: order.phone,
        total: Number(order.total),
        paymentMethod,
        receiptUrl: `${origin}/receipt/${order.id}`,
        items: (items ?? []).map((i) => ({
          title: i.title,
          author: i.author,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price),
        })),
      };

      const [emailSent, smsSent] = await Promise.all([
        sendOrderEmail(payload),
        sendOrderSms(payload),
      ]);

      await supabase
        .from("orders")
        .update({ notified_email: emailSent, notified_sms: smsSent })
        .eq("id", order.id)
        .eq("user_id", userId);
    } catch (notifyError) {
      console.error("payOrder notification failed", notifyError);
    }

    return { ok: true, alreadyPaid: false };
  });
