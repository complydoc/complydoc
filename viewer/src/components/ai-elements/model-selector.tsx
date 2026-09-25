/**
 * A model picker: a searchable command dialog, models grouped by provider.
 *
 * Adapted from Vercel's AI Elements `model-selector`
 * (https://elements.ai-sdk.dev/components/model-selector), Copyright 2023
 * Vercel, Inc., Apache License 2.0. Changed here: the logo is complydoc's
 * bundled `ProviderLogo` instead of an image fetched from models.dev.
 */
import type { ComponentProps, ReactNode } from "react";
import { ProviderLogo } from "@/components/ProviderLogo";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { matchWords } from "@/report/pricing";

export const ModelSelector = (props: ComponentProps<typeof Dialog>) => <Dialog {...props} />;

export const ModelSelectorTrigger = (props: ComponentProps<typeof DialogTrigger>) => <DialogTrigger {...props} />;

export const ModelSelectorContent = ({
  className,
  children,
  title = "Choose a model",
  ...props
}: ComponentProps<typeof DialogContent> & { title?: ReactNode }) => (
  <DialogContent aria-describedby={undefined} className={cn("overflow-hidden p-0", className)} {...props}>
    <DialogTitle className="sr-only">{title}</DialogTitle>
    <Command filter={matchWords} className="**:data-[slot=command-input-wrapper]:h-auto">
      {children}
    </Command>
  </DialogContent>
);

export const ModelSelectorInput = ({ className, ...props }: ComponentProps<typeof CommandInput>) => (
  <CommandInput className={cn("h-auto py-3.5", className)} {...props} />
);

export const ModelSelectorList = (props: ComponentProps<typeof CommandList>) => <CommandList {...props} />;

export const ModelSelectorEmpty = (props: ComponentProps<typeof CommandEmpty>) => <CommandEmpty {...props} />;

export const ModelSelectorGroup = (props: ComponentProps<typeof CommandGroup>) => <CommandGroup {...props} />;

export const ModelSelectorItem = (props: ComponentProps<typeof CommandItem>) => <CommandItem {...props} />;

export const ModelSelectorSeparator = (props: ComponentProps<typeof CommandSeparator>) => <CommandSeparator {...props} />;

export const ModelSelectorLogo = ({ provider, className }: { provider: string; className?: string | undefined }) => (
  <ProviderLogo provider={provider} className={className} />
);

export const ModelSelectorName = ({ className, ...props }: ComponentProps<"span">) => (
  <span className={cn("flex-1 truncate text-left", className)} {...props} />
);
