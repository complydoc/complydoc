import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { onConsentOpen, startAnalytics, useConsent, writeConsent } from "@/lib/consent";

/**
 * Asks once, in a small card at the bottom of the screen, whether analytics may set cookies.
 * Accept and Decline weigh the same. "Cookie settings" in the footer brings it back.
 */
export function CookieBanner({ policy }: { policy: string }) {
  const consent = useConsent();
  const [reopened, setReopened] = useState(false);

  useEffect(() => onConsentOpen(() => setReopened(true)), []);
  useEffect(() => {
    if (consent === "granted") void startAnalytics();
  }, [consent]);

  if (!reopened && consent !== null) return null;

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setReopened(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookies"
      className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-lg sm:right-auto sm:max-w-sm"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Cookies</p>
        <p className="text-sm text-pretty text-muted-foreground">
          We'd like to use analytics cookies to learn how the site is used. They are set only if you accept.{" "}
          <a href={policy} className="text-foreground underline underline-offset-4">
            Cookie policy
          </a>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => choose("denied")}>
          Decline
        </Button>
        <Button onClick={() => choose("granted")}>Accept</Button>
      </div>
    </div>
  );
}
