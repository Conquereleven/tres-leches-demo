import {
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { ArrowUpRight, X } from "@phosphor-icons/react";
import { assets, destinations, whatsappUrl, type Asset } from "./content";
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`b-button ${props.className ?? ""}`} />;
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="b-link" href={href}>
      {children}
      <ArrowUpRight aria-hidden />
    </a>
  );
}
export function WhatsAppCTA({
  children = "ORDER ON WHATSAPP",
  message = "Hello 3L, I’d like to place an order.",
  unavailable,
  className = "",
  ariaLabel,
}: {
  children?: ReactNode;
  message?: string;
  unavailable: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const href = whatsappUrl(destinations.whatsapp, message);
  return href ? (
    <a
      className={`b-button b-wa ${className}`}
      aria-label={ariaLabel}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight aria-hidden />
    </a>
  ) : (
    <Button
      className={`b-wa ${className}`}
      aria-label={ariaLabel}
      onClick={unavailable}
    >
      {children}
      <ArrowUpRight aria-hidden />
    </Button>
  );
}
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="b-label">{children}</p>;
}
export function EditorialHeading({ children }: { children: ReactNode }) {
  return <h2 className="b-heading">{children}</h2>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`b-input ${props.className ?? ""}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`b-input ${props.className ?? ""}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`b-input ${props.className ?? ""}`} />;
}
export function Rule() {
  return <hr className="b-rule" />;
}
export function StarMotif() {
  return (
    <img
      className="b-stars"
      src={assets.stars.src!}
      width="44"
      height="41"
      alt=""
    />
  );
}
export function PatternSurface({ children }: { children: ReactNode }) {
  return <div className="b-pattern">{children}</div>;
}
export function SectionContainer({
  id,
  children,
  className = "",
  label,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      id={id}
      className={`b-section ${className}`}
      aria-label={label}
      data-reveal
    >
      {children}
    </section>
  );
}
export function ResponsiveMedia({
  asset,
  eager = false,
}: {
  asset: Asset;
  eager?: boolean;
}) {
  return asset.src ? (
    <img
      src={asset.src}
      alt={asset.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  ) : (
    <div className="b-data-slot" data-asset={asset.id}>
      <span className="b-label">IMAGE PENDING</span>
      <span>{asset.alt}</span>
    </div>
  );
}
export function ImageFrame({
  asset,
  className = "",
}: {
  asset: Asset;
  className?: string;
}) {
  return (
    <div className={`b-image-frame ${className}`}>
      <ResponsiveMedia asset={asset} />
    </div>
  );
}
export function Logo({
  variant = "wordmark",
}: {
  variant?: "wordmark" | "circle" | "circleNegative" | "icon";
}) {
  const asset = assets[variant];
  return (
    <img
      className={`b-logo b-logo-${variant}`}
      src={asset.src!}
      alt={asset.alt}
      width={variant === "wordmark" ? 430 : 220}
      height={variant === "wordmark" ? 110 : 220}
    />
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = () => {
    if (closing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 260);
  };
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`b-modal ${closing ? "b-modal-closing" : ""}`}
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
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
        if ((e.target as HTMLElement).closest("a[href^='#']")) dismiss();
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            dismiss();
        }
      }}
    >
      <button
        autoFocus
        className="b-close"
        aria-label="Close dialog"
        onClick={dismiss}
      >
        <X aria-hidden />
      </button>
      <Logo />
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
