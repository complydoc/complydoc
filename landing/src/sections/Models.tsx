import { BrandLogo } from "@/components/BrandLogo";
import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Brand } from "@/lib/logos";
import { links } from "@/links";

/**
 * The newest model from each provider in complydoc's price table
 * (src/complydoc/config/model_prices.json, imported from models.dev on
 * 2026-09-25), with its release date. `checked` marks the ones also verified
 * by hand against the provider's pricing page, in pricing.yaml.
 */
const LATEST: { model: string; brand: Brand; released: string; checked?: boolean }[] = [
  { model: "Claude Opus 5.5", brand: "anthropic", released: "2026-09-22", checked: true },
  { model: "GPT-6 Sol", brand: "openai", released: "2026-09-22" },
  { model: "Grok 4.7", brand: "xai", released: "2026-09-21" },
  { model: "GLM-5.3-FlashX", brand: "zai", released: "2026-09-18" },
  { model: "DeepSeek V4.1 Flash", brand: "deepseek", released: "2026-09-10" },
  { model: "Gemini 3.8 Flash", brand: "gemini", released: "2026-09-02" },
  { model: "Kimi K3", brand: "kimi", released: "2026-07-16", checked: true },
  { model: "Mistral Medium 3.5", brand: "mistral", released: "2026-04-29" },
];

export function Models() {
  return (
    <Section
      id="models"
      eyebrow="Models"
      title="Tested against current models"
      lead="Cost estimates, routing and the vision check depend on current prices. Each price in complydoc's table is dated, and a report flags any price more than 90 days old."
    >
      <div className="max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>The newest model from each provider</CardTitle>
            <CardDescription>
              Prices come from the models.dev table, imported on 2026-09-25. Some are also checked by hand against the
              provider&apos;s pricing page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="text-right">Released</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LATEST.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell className="flex items-center gap-2">
                      <BrandLogo brand={row.brand} />
                      {row.model}
                    </TableCell>
                    <TableCell>
                      {row.checked ? (
                        <Badge variant="success">checked by hand</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">models.dev</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{row.released}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm text-muted-foreground">
              The vision check re-reads pages with a model you provide, so you can test a new model on your own
              documents as soon as you have access. <TextLink href={links.verify}>Verifying pages with a vision model</TextLink>.
            </p>
          </CardContent>
        </Card>

      </div>
    </Section>
  );
}
