import { Mail, Phone } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/format";

export function SiteFooter() {
  return (
    <footer className="no-print mt-20 border-t border-border/70 bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">About BookMarket</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/75">
            BookMarket is Ghana's student textbook store. Pick your school, department and level, and see
            exactly the books on your course list — no guessing, no queueing at the bookshop.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Need help?</h2>
          <p className="mt-3 text-sm text-primary-foreground/75">Questions about an order?</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" /> {SUPPORT_EMAIL}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" /> {SUPPORT_PHONE}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15 py-5 text-center text-xs text-primary-foreground/60">
        &copy; {new Date().getFullYear()} BookMarket Ghana. All rights reserved.
      </div>
    </footer>
  );
}
