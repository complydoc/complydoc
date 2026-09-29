/**
 * Whether a scrolling view has reached its end. There a short last page never climbs to
 * the top of the view, so the page being read is the last one whose start is in sight.
 */
export function scrolledToEnd(container: HTMLElement): boolean {
  return container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
}
