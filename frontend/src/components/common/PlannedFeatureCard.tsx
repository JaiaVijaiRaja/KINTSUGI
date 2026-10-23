import React from 'react';
import { Card, CardHeader, CardContent } from './Card';

interface PlannedFeatureCardProps {
  title: string;
  phase: string;
  icon: React.ElementType;
  description: string;
  specifications: string[];
  plannedEndpoints?: string[];
  className?: string;
}

export const PlannedFeatureCard: React.FC<PlannedFeatureCardProps> = ({
  title,
  phase,
  icon: Icon,
  description,
  specifications,
  plannedEndpoints,
  className = '',
}) => {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        icon={Icon}
        badge={
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
            {phase}
          </span>
        }
      />
      <CardContent className="space-y-4">
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          {description}
        </p>

        <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
            Architectural Specifications
          </span>
          <ul className="space-y-1 text-xs text-slate-400">
            {specifications.map((spec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold shrink-0">•</span>
                <span>{spec}</span>
              </li>
            ))}
          </ul>
        </div>

        {plannedEndpoints && plannedEndpoints.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              Planned API Endpoints
            </span>
            <div className="space-y-1">
              {plannedEndpoints.map((ep, i) => (
                <div
                  key={i}
                  className="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2 py-1 rounded border border-slate-800"
                >
                  {ep}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
