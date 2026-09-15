import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  Loader2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { date } from "./api";
import type { Session, Stage } from "./types";
import { STAGES } from "./types";
export const SessionContext = createContext<{
  session: Session;
  refreshSession: () => Promise<void>;
}>({} as never);
export const useSession = () => useContext(SessionContext);
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(message, error) => setToast({ message, error })}
    >
      {children}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "toast-error" : ""}`}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
export function Button({
  children,
  busy,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${className}`}
      aria-busy={busy || undefined}
    >
      {busy && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  const id = useId();
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
      {hint && <small id={id}>{hint}</small>}
    </label>
  );
}
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={19} />
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
export function Loading({
  label = "Carregando informações…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <Loader2 size={25} className="spin" />
      <span>{label}</span>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <FileSearch size={30} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Badge({
  children,
  color = "slate",
  dot = false,
}: {
  children: ReactNode;
  color?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge ${color}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function StageBadge({ stage }: { stage: Stage }) {
  const item = STAGES.find((s) => s.value === stage);
  return (
    <Badge color={item?.color} dot>
      {item?.label || stage}
    </Badge>
  );
}
export function Score({
  value,
  excluded,
}: {
  value: number;
  excluded?: boolean;
}) {
  return (
    <span
      className={`score ${excluded ? "score-excluded" : value >= 60 ? "score-high" : ""}`}
      title="Compatibilidade calculada por regras do seu perfil e catálogo; não substitui a leitura do edital."
    >
      <span className="score-dot" />
      {excluded ? "Fora do perfil" : `${Math.round(value)}% de aderência`}
    </span>
  );
}
export function Deadline({ value }: { value: string | null }) {
  if (!value) return <span className="muted">Sem prazo informado</span>;
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  return (
    <span className={days < 0 ? "muted" : days <= 3 ? "text-amber" : ""}>
      {date(value)}
      {days >= 0 && days <= 7 && (
        <span className="deadline-suffix">
          {" "}
          · {days === 0 ? "hoje" : `${days}d`}
        </span>
      )}
      {days < 0 && " · encerrado"}
    </span>
  );
}
export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="back-link" to={to}>
      <ChevronRight size={16} />
      {children}
    </Link>
  );
}
export function CardLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The first Escape belongs to an open native/customizable picker, not the dialog.
        const pickerOpen = CSS.supports('selector(select:open)') && ref.current?.querySelector('select:open');
        if (!pickerOpen && !e.defaultPrevented) closeRef.current();
      }
      if (e.key !== "Tab") return;
      const controls = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) || []),
      ].filter((el) => el.offsetParent !== null);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar janela"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function CheckRow({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="custom-check">
        <Check size={12} />
      </span>
      <span>{children}</span>
    </label>
  );
}
export function Confirm({
  title,
  message,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-copy">{message}</p>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} busy={busy}>
          Excluir
        </Button>
      </div>
    </Modal>
  );
}
