export const AUDIT_EVENT = "complydoc:audit-documents";

/** Asks the bar's button to open its dialog, from the menu or a page. */
export function askToAudit() {
  window.dispatchEvent(new Event(AUDIT_EVENT));
}
