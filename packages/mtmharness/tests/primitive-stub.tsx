import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ icon, variant: _variant, size: _size, children, ...props }: {
  icon?: ReactNode;
  variant?: string;
  size?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}>{icon}{children}</button>;
}

export function IconCodeOutline16() {
  return <span aria-hidden="true" data-testid="mtmharness-icon" />;
}

export function Modal({ open, onClose, title, closeLabel, description, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
      <button type="button" aria-label={closeLabel ?? "Close"} onClick={onClose}>Close</button>
      {footer}
    </div>
  );
}
