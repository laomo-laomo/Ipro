'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-[18px] bg-gradient-to-r from-[#f4ede3] via-[#fbf6ee] to-[#f4ede3]', className)} />;
}

export function StoryCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/82 p-2 shadow-sm">
      <Skeleton className="aspect-[3/4] w-full rounded-[22px]" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function StoryGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <StoryCardSkeleton key={index} />
      ))}
    </div>
  );
}
