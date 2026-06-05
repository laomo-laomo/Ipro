'use client';

import { cn } from '@/lib/utils';

interface FloatingParticlesProps {
  className?: string;
  count?: number;
}

const POSITIONS = [
  { left: '6%', top: '10%', delay: '0s', duration: '5.5s' },
  { left: '18%', top: '24%', delay: '0.8s', duration: '6.2s' },
  { left: '32%', top: '8%', delay: '1.6s', duration: '5.8s' },
  { left: '46%', top: '18%', delay: '0.3s', duration: '6.8s' },
  { left: '60%', top: '12%', delay: '1.1s', duration: '5.9s' },
  { left: '72%', top: '28%', delay: '0.5s', duration: '6.5s' },
  { left: '86%', top: '14%', delay: '1.4s', duration: '5.4s' },
  { left: '10%', top: '58%', delay: '0.2s', duration: '6.1s' },
  { left: '24%', top: '72%', delay: '1.9s', duration: '5.7s' },
  { left: '55%', top: '66%', delay: '0.9s', duration: '6.4s' },
  { left: '78%', top: '74%', delay: '0.7s', duration: '5.6s' },
  { left: '90%', top: '54%', delay: '1.7s', duration: '6.7s' },
];

export function FloatingParticles({ className, count = 10 }: FloatingParticlesProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {POSITIONS.slice(0, count).map((particle, index) => (
        <span
          key={`${particle.left}-${particle.top}-${index}`}
          className="absolute block h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 via-white to-violet-300 opacity-70 blur-[0.4px]"
          style={{
            left: particle.left,
            top: particle.top,
            animation: `float-soft ${particle.duration} ease-in-out ${particle.delay} infinite`,
            boxShadow: '0 0 24px rgba(255,255,255,0.45)',
          }}
        />
      ))}
    </div>
  );
}
