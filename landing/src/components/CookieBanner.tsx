import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { onConsentOpen, startAnalytics, useConsent, writeConsent } from "@/lib/consent";

/**
 * Asks once, in one slim line at the bottom of the screen, whether analytics may set cookies.
 * Accept and Decline sit side by side. "Cookie settings" in the footer brings it back.
 */
export function CookieBanner({ policy }: { policy: string }) {
  const consent = useConsent();
  const [reopened, setReopened] = useState(false);

  useEffect(() => onConsentOpen(() => setReopened(true)), []);
  useEffect(() => {
    if (consent === "granted") startAnalytics();
  }, [consent]);

  if (!reopened && consent !== null) return null;

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setReopened(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border bg-background/95 p-3 pl-5 text-sm shadow-sm backdrop-blur sm:flex-row sm:items-center sm:rounded-full"
    >
      <p className="flex-1 text-pretty text-muted-foreground">
        We use cookies for analytics, only if you accept.{" "}
        <a href={policy} className="text-foreground underline-offset-4 hover:underline">
          Learn more
        </a>
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => choose("denied")}>
          Decline
        </Button>
        <Button size="sm" className="flex-1 sm:flex-none" onClick={() => choose("granted")}>
          Accept
        </Button>
      </div>
    </div>
  );
}
