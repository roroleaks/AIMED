"use client";

import React from "react";

interface WorkflowStepperProps {
  currentStep?: 1 | 2 | 3 | 4;
  current?: 1 | 2 | 3 | 4;
}

const STEPS = [
  { step: 1, label: "1 Words" },
  { step: 2, label: "2 Screening" },
  { step: 3, label: "3 Explorer" },
  { step: 4, label: "4 Summary" },
] as const;

export function WorkflowStepper({ currentStep, current }: WorkflowStepperProps) {
  const activeStep = currentStep ?? current ?? 1;

  return (
    <nav
      data-testid="stepper"
      aria-label="Workflow progress"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        margin: "var(--space-3) 0 var(--space-4) 0",
        padding: "var(--space-2) var(--space-3)",
        background: "var(--canvas)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)"
      }}
    >
      {STEPS.map((s, idx) => {
        const isCurrent = s.step === activeStep;
        const isCompleted = s.step < activeStep;

        return (
          <React.Fragment key={s.step}>
            {idx > 0 && (
              <span
                style={{
                  color: "var(--muted-2)",
                  fontSize: "var(--fs-caption)",
                  fontWeight: 600,
                  userSelect: "none"
                }}
                aria-hidden="true"
              >
                ·
              </span>
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--fs-caption)",
                fontWeight: isCurrent ? 700 : 500,
                background: isCurrent
                  ? "var(--accent)"
                  : isCompleted
                  ? "var(--accent-subtle)"
                  : "transparent",
                color: isCurrent
                  ? "#ffffff"
                  : isCompleted
                  ? "var(--accent)"
                  : "var(--muted-2)",
                border: isCurrent
                  ? "1px solid var(--accent)"
                  : isCompleted
                  ? "1px solid var(--accent-border)"
                  : "1px solid transparent",
                lineHeight: "var(--lh-tight)"
              }}
              aria-current={isCurrent ? "step" : undefined}
            >
              {s.label}
            </span>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
