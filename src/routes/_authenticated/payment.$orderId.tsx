import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Lock, Smartphone } from "lucide-react";
import { payOrder } from "@/lib/orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { cedis } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/payment/$orderId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Make payment — BookMarket Ghana" },
      { name: "description", content: "Pay for your textbook order with Mobile Money or card." },
      { property: "og:title", content: "Make payment — BookMarket Ghana" },
      { property: "og:description", content: "Pay for your textbook order with Mobile Money or card." },
    ],
  }),
  component: PaymentPage,
});

function PaymentPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const pay = useServerFn(payOrder);
  const [method, setMethod] = useState<"momo" | "card">("momo");
  const [momo, setMomo] = useState({ network: "MTN", number: "" });
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "" });
  const [busy, setBusy] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_ref, total, payment_status, order_items(id, title, quantity, unit_price)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handlePay() {
    setBusy(true);
    try {
      await pay({ data: { orderId, method } });
      toast.success("Payment received. Here is your receipt.");
      navigate({ to: "/receipt/$orderId", params: { orderId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Order not found</h1>
        <Link to="/books" className="mt-6 inline-block">
          <Button>Back to books</Button>
        </Link>
      </div>
    );
  }

  if (order.payment_status === "PAID") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">This order is already paid</h1>
        <Link to="/receipt/$orderId" params={{ orderId }} className="mt-6 inline-block">
          <Button>View receipt</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="paper-grain min-h-[70vh]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-xl border border-border bg-card p-6 shadow-card sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Order {order.order_ref}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold">Make payment</h1>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Amount</p>
              <p className="font-display text-2xl font-semibold text-primary">{cedis(order.total)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(
              [
                { id: "momo" as const, label: "Mobile Money", icon: Smartphone },
                { id: "card" as const, label: "Card", icon: CreditCard },
              ]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMethod(option.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                  method === option.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                <option.icon className="size-5 text-primary" />
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>

          {method === "momo" ? (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Network</Label>
                <div className="flex flex-wrap gap-2">
                  {["MTN", "Telecel", "AirtelTigo"].map((network) => (
                    <button
                      key={network}
                      type="button"
                      onClick={() => setMomo({ ...momo, network })}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        momo.network === network
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      {network}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="momoNumber">Mobile Money number</Label>
                <Input
                  id="momoNumber"
                  value={momo.number}
                  onChange={(event) => setMomo({ ...momo, number: event.target.value })}
                  placeholder="0551234567"
                  inputMode="tel"
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  value={card.number}
                  onChange={(event) => setCard({ ...card, number: event.target.value })}
                  placeholder="4242 4242 4242 4242"
                  inputMode="numeric"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cardExpiry">Expiry</Label>
                  <Input
                    id="cardExpiry"
                    value={card.expiry}
                    onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                    placeholder="09/28"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cardCvv">CVV</Label>
                  <Input
                    id="cardCvv"
                    value={card.cvv}
                    onChange={(event) => setCard({ ...card, cvv: event.target.value })}
                    placeholder="123"
                  />
                </div>
              </div>
            </div>
          )}

          <Button className="mt-6 w-full gap-2" disabled={busy} onClick={handlePay}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Pay {cedis(order.total)}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Test mode: payments are simulated, so no money leaves your wallet or card yet.
          </p>
        </div>
      </div>
    </div>
  );
}
