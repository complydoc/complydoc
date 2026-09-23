import { ImageOffIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Box, PagePreview } from "@/report/types";

function place(box: Box) {
  return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` };
}

/** Whether there is anything to draw: a picture, or at least the layout of the text. */
function hasPicture(preview: PagePreview | undefined): preview is PagePreview {
  return Boolean(preview && (preview.image_data_uri || preview.text_blocks.length > 0));
}

/**
 * The page as it looks: its picture when the run took one, otherwise the
 * layout of its text, with every identifier found marked where it sits.
 * It fills its space as far as the page's proportions allow, so the marks
 * stay on the words they belong to at any size.
 */
export function PagePicture({ preview }: { preview: PagePreview | undefined }) {
  if (!hasPicture(preview)) {
    return (
      <Empty className="h-full p-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageOffIcon />
          </EmptyMedia>
          <EmptyTitle>No picture of this page</EmptyTitle>
          <EmptyDescription>
            Run the audit with <code>--page-images --detail full</code> to see the page beside its text.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const ratio = preview.width_pt / preview.height_pt;
  return (
    // A size container, so the page can take the largest size that fits both ways.
    <div className="flex size-full items-center justify-center" style={{ containerType: "size" }}>
      <figure
        aria-label={`Page ${preview.number}`}
        className="relative m-0 overflow-hidden rounded-md bg-card ring-1 ring-foreground/10"
        style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, aspectRatio: `${ratio}` }}
      >
        {preview.image_data_uri ? (
          <img src={preview.image_data_uri} alt="" className="absolute inset-0 size-full" />
        ) : (
          preview.text_blocks.map((box, index) => (
            <span key={index} aria-hidden="true" className="absolute rounded-xs bg-muted-foreground/25" style={place(box)} />
          ))
        )}
        {preview.sensitive.map((box, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={box.title ?? "Sensitive item"}
                className="absolute rounded-xs bg-destructive/25 ring-1 ring-destructive"
                style={place(box)}
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line">{box.title}</TooltipContent>
          </Tooltip>
        ))}
      </figure>
    </div>
  );
}
