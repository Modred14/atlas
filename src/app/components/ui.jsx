// src/app/components/ui.jsx
"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";

export const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- api */

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  if (res.status === 401 && !path.startsWith("/api/auth/") && typeof window !== "undefined") {
    const data401 = await res.clone().json().catch(() => null);
    // A Gmail "reconnect" 401 is not a login problem.
    if (!data401?.reauth) {
      // Full reload on purpose: the session is gone, so start clean at the sign-in page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      throw new ApiError("Session expired", 401);
    }
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

// Loads data and exposes reload. Keeps the previous data visible while a new path or a reload is in flight.
export function useLoad(path, { enabled = true } = {}) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !path) return;
    const mine = ++seq.current;
    try {
      const out = await api(path);
      if (mine === seq.current) setState({ key: path, data: out, error: null });
    } catch (err) {
      if (mine === seq.current) setState((s) => ({ key: path, data: s.data, error: err }));
    }
  }, [path, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);
  const loading = enabled && Boolean(path) && (state.key !== path || refreshing);
  return { data: state.data, error: state.error, loading, reload, setData };
}

/* -------------------------------------------------------------- toasts */

const ToastCtx = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const color = { success: "text-emerald-400", error: "text-red-400", info: "text-[rgb(77,141,255)]" };
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {items.map((t) => {
          const I = Icon[t.tone] || Info;
          return (
            <div key={t.id} role="status" className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-white/10 bg-[#141418] px-3.5 py-3 text-sm text-zinc-200 shadow-xl shadow-black/50">
              <I size={16} className={cx("mt-0.5 shrink-0", color[t.tone])} />
              <span className="min-w-0 flex-1 break-words">{t.message}</span>
              <button aria-label="Dismiss" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} className="text-zinc-500 hover:text-zinc-200">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`.toast-in{animation:toastIn .18s ease-out}@keyframes toastIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------- primitives */

export function Card({ className, children, as: Tag = "section", padded = true, ...rest }) {
  return (
    <Tag className={cx("rounded-xl border border-white/[0.07] bg-[#0d0d10]", padded && "p-4 sm:p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children, wide = false }) {
  return <div className={cx("mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-9 lg:px-10", wide ? "max-w-7xl" : "max-w-6xl")}>{children}</div>;
}

const BTN = {
  primary: "bg-[rgb(77,141,255)] text-white hover:bg-[rgb(97,155,255)] disabled:hover:bg-[rgb(77,141,255)]",
  secondary: "border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]",
  ghost: "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
  danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  success: "bg-emerald-500 text-white hover:bg-emerald-400 disabled:hover:bg-emerald-500",
};

export function Button({ variant = "secondary", size = "md", loading = false, icon: Icon, className, children, disabled, ...rest }) {
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(77,141,255)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

const inputBase =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors hover:border-white/20 focus:border-[rgb(77,141,255)] focus:outline-none focus:ring-2 focus:ring-[rgba(77,141,255,0.2)] disabled:opacity-50";

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={cx("block", className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-zinc-300">
          {label}
        </label>
      )}
      {typeof children === "function" ? children(id) : children}
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : hint ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, id, ...rest }) {
  return <input id={id} className={cx(inputBase, "h-9", className)} {...rest} />;
}

export function Textarea({ className, id, rows = 4, ...rest }) {
  return <textarea id={id} rows={rows} className={cx(inputBase, "resize-y py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, id, children, ...rest }) {
  return (
    <select id={id} className={cx(inputBase, "h-9 appearance-none bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 12px center" }} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-50")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(77,141,255)]", checked ? "bg-[rgb(77,141,255)]" : "bg-white/15")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-150", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

const TONES = {
  neutral: "bg-white/[0.06] text-zinc-400 border-white/10",
  blue: "bg-[rgba(77,141,255,0.12)] text-[rgb(125,178,255)] border-[rgba(77,141,255,0.25)]",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  red: "bg-red-500/10 text-red-300 border-red-500/25",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/25",
};

export function Badge({ tone = "neutral", children, className }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium", TONES[tone], className)}>{children}</span>;
}

export function Skeleton({ className }) {
  return <div className={cx("animate-pulse rounded-md bg-white/[0.06]", className)} />;
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500">
          <Icon size={18} />
        </div>
      )}
      <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3.5 py-3 text-sm text-red-200">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
      <span className="min-w-0 flex-1">{error.message || String(error)}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-medium text-red-300 underline-offset-2 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }) {
  const styles = {
    info: "border-[rgba(77,141,255,0.25)] bg-[rgba(77,141,255,0.07)] text-zinc-300",
    warn: "border-amber-500/25 bg-amber-500/[0.07] text-amber-100",
    error: "border-red-500/25 bg-red-500/[0.07] text-red-200",
    success: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100",
  };
  const I = tone === "error" || tone === "warn" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={cx("flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm", styles[tone])}>
      <I size={16} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <div className="font-medium text-white">{title}</div>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, loading }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0d10] p-4">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-white">{value}</div>}
      {hint && <div className="mt-1 text-xs text-zinc-600">{hint}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/[0.07] px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative shrink-0 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors",
            value === t.id ? "text-white" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {t.label}
          {t.count > 0 && <span className="ml-1.5 rounded bg-[rgba(77,141,255,0.15)] px-1.5 py-px text-[11px] text-[rgb(125,178,255)]">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[rgb(77,141,255)]" />}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, description, children, footer, wide = false, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
        const list = [...f].filter((el) => !el.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("relative flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-white/10 bg-[#101014] shadow-2xl shadow-black/60 sm:rounded-xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
          </div>
          <button aria-label="Close" disabled={busy} onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", danger = false, busy = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-zinc-400">{children}</div>
    </Modal>
  );
}

/* --------------------------------------------------------------- misc */

export function timeAgo(value) {
  if (!value) return "—";
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const STATUS_LABEL = {
  discovered: "Discovered", researched: "Researched", ready_for_outreach: "Ready for outreach", email_sent: "Email sent",
  replied: "Replied", interested: "Interested", rejected: "Rejected", no_response: "No response", do_not_contact: "Do not contact",
};
export const STATUS_TONE = {
  discovered: "neutral", researched: "blue", ready_for_outreach: "violet", email_sent: "blue", replied: "amber",
  interested: "green", rejected: "red", no_response: "neutral", do_not_contact: "red",
};
export const MAIL_TONE = { draft: "neutral", pending_approval: "amber", approved: "blue", sending: "blue", sent: "green", failed: "red", rejected: "neutral", bounced: "red" };
export const MAIL_LABEL = { draft: "Draft", pending_approval: "Needs approval", approved: "Approved", sending: "Sending", sent: "Sent", failed: "Failed", rejected: "Rejected", bounced: "Bounced" };
export const CATEGORY_LABEL = {
  interested: "Interested", interview: "Interview", more_info: "More info requested", rejection: "Rejection",
  follow_up_required: "Follow-up required", other: "Other", bounce: "Bounce", opt_out: "Opt-out", auto_reply: "Auto-reply",
};
export const CATEGORY_TONE = { interested: "green", interview: "green", more_info: "blue", rejection: "red", follow_up_required: "amber", other: "neutral", bounce: "red", opt_out: "red", auto_reply: "neutral" };

// Comma-separated list editor shown as chips. Commits on Enter, comma or blur.
export function ListInput({ value, onChange, placeholder, label, max = 40 }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, max));
    setDraft("");
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 transition-colors focus-within:border-[rgb(77,141,255)] focus-within:ring-2 focus-within:ring-[rgba(77,141,255,0.2)]">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] py-0.5 pl-2 pr-1 text-[13px] text-zinc-200">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
            else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={commit}
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
    </div>
  );
}
