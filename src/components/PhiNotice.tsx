import { PHI_NOTICE_TEXT } from "@/lib/phi-notice";

export function PhiNotice() {
  return (
    <aside
      aria-label="Patient Privacy Notice"
      role="note"
      className="notice notice--neutral"
      style={{
        marginTop: "var(--space-3)",
        marginBottom: "var(--space-3)",
        maxWidth: "var(--reading-max)",
        lineHeight: "var(--lh-normal)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
        <span aria-hidden="true" style={{ fontSize: "var(--fs-body)", lineHeight: 1 }}>🔒</span>
        <div>
          <strong style={{ display: "block", color: "var(--ink)", marginBottom: "var(--space-1)" }}>
            Patient Privacy Notice:
          </strong>
          <span>{PHI_NOTICE_TEXT}</span>
        </div>
      </div>
    </aside>
  );
}
