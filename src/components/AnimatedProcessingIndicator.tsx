import React from 'react';

export interface AnimatedProcessingIndicatorProps {
  message: string;
  secondaryMessage?: string;
  progress?: number;
}

export const AnimatedProcessingIndicator: React.FC<AnimatedProcessingIndicatorProps> = ({
  message,
  secondaryMessage,
  progress,
}) => {
  return (
    <div className="processing-indicator-container" role="status">
      <div className="processing-animation-wrapper">
        <svg viewBox="0 0 200 200" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Background Radial Glow */}
          <circle cx="100" cy="100" r="70" fill="url(#radialGlow)" className="anim-pulse-glow" />

          {/* Outer Orbital Ring */}
          <circle cx="100" cy="100" r="85" stroke="#edf5f5" strokeWidth="2" strokeDasharray="5 5" />
          
          {/* Inner Flowing Ring */}
          <circle cx="100" cy="100" r="65" stroke="var(--accent, #0f766e)" strokeWidth="1.5" strokeOpacity="0.25" />
          <circle cx="100" cy="100" r="65" stroke="var(--accent, #0f766e)" strokeWidth="2" strokeDasharray="12 12" className="anim-rotate anim-flow" strokeLinecap="round" />

          {/* Connecting Evidence Network Lines */}
          <g stroke="var(--accent, #0f766e)" strokeWidth="1" strokeOpacity="0.3" className="anim-rotate-rev">
            <line x1="100" y1="100" x2="50" y2="60" />
            <line x1="100" y1="100" x2="150" y2="60" />
            <line x1="100" y1="100" x2="140" y2="145" />
            <line x1="100" y1="100" x2="60" y2="140" />
            <line x1="50" y1="60" x2="150" y2="60" />
            <line x1="150" y1="60" x2="140" y2="145" />
            <line x1="140" y1="145" x2="60" y2="140" />
            <line x1="60" y1="140" x2="50" y2="60" />
          </g>

          {/* Connected Active Evidence Nodes (Orbiting/Floating) */}
          {/* P — Population Node (top-left) */}
          <g className="anim-node-p">
            <circle cx="50" cy="60" r="14" fill="#fff" stroke="var(--accent, #0f766e)" strokeWidth="1.5" />
            <circle cx="50" cy="60" r="10" fill="var(--accent-light, #e3f2f2)" />
            <text x="50" y="64" fontSize="12" fontWeight="bold" fill="var(--accent, #0f766e)" textAnchor="middle">P</text>
          </g>

          {/* I — Intervention Node (top-right) */}
          <g className="anim-node-i">
            <circle cx="150" cy="60" r="14" fill="#fff" stroke="var(--accent, #0f766e)" strokeWidth="1.5" />
            <circle cx="150" cy="60" r="10" fill="var(--accent-light, #e3f2f2)" />
            <text x="150" y="64" fontSize="12" fontWeight="bold" fill="var(--accent, #0f766e)" textAnchor="middle">I</text>
          </g>

          {/* C — Comparator Node (bottom-right) */}
          <g className="anim-node-c">
            <circle cx="140" cy="145" r="14" fill="#fff" stroke="var(--accent, #0f766e)" strokeWidth="1.5" />
            <circle cx="140" cy="145" r="10" fill="var(--accent-light, #e3f2f2)" />
            <text x="140" y="149" fontSize="12" fontWeight="bold" fill="var(--accent, #0f766e)" textAnchor="middle">C</text>
          </g>

          {/* O — Outcome Node (bottom-left) */}
          <g className="anim-node-o">
            <circle cx="60" cy="140" r="14" fill="#fff" stroke="var(--accent, #0f766e)" strokeWidth="1.5" />
            <circle cx="60" cy="140" r="10" fill="var(--accent-light, #e3f2f2)" />
            <text x="60" y="144" fontSize="12" fontWeight="bold" fill="var(--accent, #0f766e)" textAnchor="middle">O</text>
          </g>

          {/* Rotating Data Flow Particles */}
          <g className="anim-rotate" strokeWidth="3" strokeLinecap="round">
            <circle cx="100" cy="100" r="40" stroke="var(--accent, #0f766e)" strokeDasharray="1 100" strokeOpacity="0.8" />
            <circle cx="100" cy="100" r="50" stroke="var(--accent, #0f766e)" strokeDasharray="1 150" strokeOpacity="0.6" />
          </g>

          {/* Central Processor Node (AI Core) */}
          <g className="anim-pulse-core">
            <circle cx="100" cy="100" r="24" fill="#fff" stroke="var(--accent, #0f766e)" strokeWidth="2.5" />
            <circle cx="100" cy="100" r="18" fill="var(--accent, #0f766e)" />
            {/* Glowing inner dot */}
            <circle cx="100" cy="100" r="6" fill="#fff" />
          </g>

          {/* Gradient Definitions */}
          <defs>
            <radialGradient id="radialGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent, #0f766e)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent, #0f766e)" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {/* Dynamic Status Messages */}
      <h2 className="processing-text-primary">{message}</h2>
      {secondaryMessage && <p className="processing-text-secondary">{secondaryMessage}</p>}

      {/* Optional Progress Bar */}
      {typeof progress === 'number' && (
        <div style={{ marginTop: 16, width: '100%', maxWidth: '280px' }}>
          <div className="bar-bg" style={{ height: 6 }}>
            <div className="bar" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}></div>
          </div>
        </div>
      )}
    </div>
  );
};
