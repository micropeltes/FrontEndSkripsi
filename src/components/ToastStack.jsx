import { useEffect } from "react";

export default function ToastStack({ toasts, onRemove }) {
  useEffect(() => {
    if (!Array.isArray(toasts) || toasts.length === 0) {
      return undefined;
    }

    const timers = toasts.map((toast) =>
      setTimeout(() => {
        onRemove(toast.id);
      }, toast.durationMs ?? 3200)
    );

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [onRemove, toasts]);

  if (!Array.isArray(toasts) || toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`toast-item ${toast.type === "error" ? "is-error" : "is-success"}`}
        >
          <p className="toast-title">{toast.type === "error" ? "Gagal" : "Berhasil"}</p>
          <p className="toast-message">{toast.message}</p>
          <button
            type="button"
            className="toast-close"
            onClick={() => onRemove(toast.id)}
            aria-label="Tutup notifikasi"
          >
            Tutup
          </button>
        </article>
      ))}
    </div>
  );
}
