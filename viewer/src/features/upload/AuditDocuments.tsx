import { FileUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Uploader } from "@/hooks/useUpload";
import { AUDIT_EVENT, askToAudit } from "./askToAudit";
import { UploadPanel } from "./UploadPanel";

/** The dialog that takes documents to audit; it closes itself once the report opens. */
export function UploadDialog({
  upload,
  open,
  onOpenChange,
}: {
  upload: Uploader;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    // Reading carries on if it is closed sooner.
    <Dialog open={open && upload.state.phase !== "done"} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add documents</DialogTitle>
          <DialogDescription>Copied to this machine and audited here.</DialogDescription>
        </DialogHeader>
        <UploadPanel upload={upload.state} onStart={(picked) => void upload.start(picked)} />
      </DialogContent>
    </Dialog>
  );
}


/** The bar's button for auditing new documents, where `complydoc ui` takes them. Other places
 *  ask it with `askToAudit`, so there is one dialog and one upload at a time. */
export function AuditDocuments({ upload }: { upload: Uploader }) {
  const [open, setOpen] = useState(false);
  const { state, reset } = upload;
  useEffect(() => {
    const onAsk = () => {
      if (state.phase === "done" || state.phase === "failed") reset();
      setOpen(true);
    };
    window.addEventListener(AUDIT_EVENT, onAsk);
    return () => window.removeEventListener(AUDIT_EVENT, onAsk);
  }, [state.phase, reset]);
  return (
    <>
      <Button size="sm" onClick={askToAudit}>
        <FileUpIcon />
        <span className="hidden sm:inline">Add documents</span>
      </Button>
      <UploadDialog upload={upload} open={open} onOpenChange={setOpen} />
    </>
  );
}
