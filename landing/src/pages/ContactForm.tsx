import { MailIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CONTACT_EMAIL } from "@/links";

const INTERESTS = [
  { id: "pilot", label: "Early access for my team" },
  { id: "server", label: "A server inside our network" },
  { id: "engineering", label: "complydoc for our engineers" },
  { id: "other", label: "Something else" },
] as const;

/**
 * A form that writes the email for you. The site is static, so nothing is sent
 * from it: submitting opens the reader's mail app with the message filled in.
 */
export function ContactForm() {
  const [interest, setInterest] = useState<string>("pilot");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const topic = INTERESTS.find((i) => i.id === interest)?.label ?? "";
    const subject = `${topic}: ${value("company")}`;
    const body = [
      value("message"),
      "",
      `Name: ${value("name")}`,
      `Company: ${value("company")}`,
      `Email: ${value("email")}`,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium" id="interest-label">
              What would you like?
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={2}
              value={interest}
              onValueChange={(value) => value && setInterest(value)}
              aria-labelledby="interest-label"
              className="flex-wrap"
            >
              {INTERESTS.map((option) => (
                <ToggleGroupItem key={option.id} value={option.id} className="px-4">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Name
                <Input name="name" required autoComplete="name" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Company
                <Input name="company" required autoComplete="organization" />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Work email
              <Input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Your team, its assistants and its documents
              <Textarea
                name="message"
                rows={5}
                required
                placeholder="About 40 people use Copilot and Claude with contracts and invoices; we want to know what they share."
              />
            </label>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Opens your email app with the message written. Nothing is sent from this page.
            </p>
            <Button type="submit" className="shrink-0">
              <MailIcon data-icon="inline-start" />
              Write the email
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
