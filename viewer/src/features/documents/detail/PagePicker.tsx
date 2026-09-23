import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface PagePickerProps {
  count: number;
  current: number;
  onPick: (index: number) => void;
}

/** Which page of the document to compare. Hidden for a one-page document. */
export function PagePicker({ count, current, onPick }: PagePickerProps) {
  if (count < 2) return null;
  const pages = Array.from({ length: count }, (_, index) => index);
  return (
    <Pagination className="mx-0 w-auto justify-start">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={current === 0}
            onClick={(event) => {
              event.preventDefault();
              if (current > 0) onPick(current - 1);
            }}
          />
        </PaginationItem>
        {pages.map((index) => (
          <PaginationItem key={index}>
            <PaginationLink
              href="#"
              isActive={index === current}
              onClick={(event) => {
                event.preventDefault();
                onPick(index);
              }}
            >
              {index + 1}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={current === count - 1}
            onClick={(event) => {
              event.preventDefault();
              if (current < count - 1) onPick(current + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
