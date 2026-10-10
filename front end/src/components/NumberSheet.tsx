import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Button, type T } from "../components";

export default function NumberSheet({
  value,
  min,
  max,
  label,
  title,
  children,
  className,
  onConfirm,
  t,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  title: string;
  children: ReactNode;
  className: string;
  onConfirm: (value: number) => void;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // A temporary choice is committed only by Done; the parent owns the saved value.
  const [draft, setDraft] = useState(value);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  };
  useEffect(() => {
    if (!open) return;
    const sheet = dialog.current!;
    const scrollY = window.scrollY;
    const old = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    Object.assign(document.body.style, {
      overflow: "hidden",
      position: "fixed",
      top: `-${scrollY}px`,
      width: "100%",
    });
    sheet.showModal();
    sheet.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      clearTimeout(timer.current);
      sheet.close();
      Object.assign(document.body.style, old);
      window.scrollTo({ top: scrollY });
      if (trigger.current?.isConnected)
        trigger.current.focus({ preventScroll: true });
    };
  }, [open]);
  const choose = (next: number) => {
    setDraft(next);
    dialog.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)
      ?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-value={value}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && (
        <dialog
          ref={dialog}
          id={id}
          className={`number-sheet ${closing ? "is-closing" : ""}`}
          aria-labelledby={`${id}-title`}
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not([disabled]):not([tabindex="-1"])',
            );
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }}
          onCancel={(e) => {
            e.preventDefault();
            dismiss();
          }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              dismiss();
          }}
        >
          <div className="number-sheet-handle" aria-hidden="true" />
          <header className="number-sheet-header">
            <h2 id={`${id}-title`}>{title}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label={t("closeSelector")}
              onClick={dismiss}
            >
              <X size={22} />
            </button>
          </header>
          <div
            className="number-sheet-options"
            role="radiogroup"
            aria-label={label}
            onKeyDown={(e) => {
              const moves: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: 4,
                ArrowUp: -4,
              };
              if (e.key in moves || e.key === "Home" || e.key === "End") {
                e.preventDefault();
                choose(
                  e.key === "Home"
                    ? min
                    : e.key === "End"
                      ? max
                      : Math.min(max, Math.max(min, draft + moves[e.key])),
                );
              }
            }}
          >
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
              (number) => (
                <button
                  key={number}
                  type="button"
                  role="radio"
                  aria-label={String(number)}
                  aria-checked={draft === number}
                  tabIndex={draft === number ? 0 : -1}
                  data-value={number}
                  onClick={() => setDraft(number)}
                >
                  <span>{number}</span>
                  {draft === number && <Check size={15} aria-hidden="true" />}
                </button>
              ),
            )}
          </div>
          <footer className="number-sheet-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={dismiss}
            >
              {t("cancel")}
            </button>
            <Button
              disabled={closing}
              onClick={() => {
                if (Number.isInteger(draft) && draft >= min && draft <= max)
                  onConfirm(draft);
                dismiss();
              }}
            >
              {t("done")}
            </Button>
          </footer>
        </dialog>
      )}
    </>
  );
}
