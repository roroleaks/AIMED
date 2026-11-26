"use client";

import React, { useEffect, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  titleId?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number | string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleId = "modal-dialog-title",
  triggerRef,
  children,
  footer,
  maxWidth
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element or the dialog container
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          // If the first is the close button and there's a search input, focus input first
          const searchInput = dialogRef.current.querySelector<HTMLElement>('input[type="text"]');
          if (searchInput) {
            searchInput.focus();
          } else {
            focusable[0].focus();
          }
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const triggerEl = triggerRef?.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
      if (triggerEl) {
        triggerEl.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="aimed-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        data-testid="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="aimed-modal-content"
        style={{ maxWidth: maxWidth || "min(720px, calc(100vw - 32px))" }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="aimed-modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="aimed-modal-close btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="aimed-modal-body">{children}</div>
        {footer && <div className="aimed-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
