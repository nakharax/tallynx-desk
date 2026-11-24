import { Suspense, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface DeskDialogProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  fallback?: ReactNode;
  variant?: 'sheet';
  panelClassName?: string;
  panelStyle?: CSSProperties;
}

export function DeskDialog({ label, onClose, children, fallback, variant, panelClassName, panelStyle }: DeskDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={variant === 'sheet' ? 'fx-modal-overlay fx-mobile-more-backdrop' : 'fx-modal-overlay'}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={panelClassName ? `fx-modal-dialog ${panelClassName}` : 'fx-modal-dialog'} style={panelStyle}>
        {fallback ? <Suspense fallback={fallback}>{children}</Suspense> : children}
      </div>
    </dialog>
  );
}
