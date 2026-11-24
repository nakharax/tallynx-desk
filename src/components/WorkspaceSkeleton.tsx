import React from 'react';

export interface WorkspaceSkeletonProps {
  label?: string;
}

export const WorkspaceSkeleton: React.FC<WorkspaceSkeletonProps> = ({ label = 'Loading workspace...' }) => (
  <div className="desk-skeleton-wrap" role="status" aria-live="polite" aria-label={label}>
    <div className="fx-kpi-row-4 desk-skeleton-kpis">
      {[0, 1, 2, 3].map((idx) => (
        <div key={idx} className="fx-stat-card desk-skeleton-card">
          <div className="desk-skeleton-line sm" />
          <div className="desk-skeleton-line lg" />
          <div className="desk-skeleton-line md" />
        </div>
      ))}
    </div>
    <div className="desk-skeleton-grid">
      <div className="card desk-skeleton-panel">
        <div className="desk-skeleton-line md" />
        <div className="desk-skeleton-block" />
      </div>
      <div className="card desk-skeleton-panel">
        <div className="desk-skeleton-line md" />
        <div className="desk-skeleton-block" />
      </div>
    </div>
  </div>
);
