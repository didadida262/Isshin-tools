export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-hover/80 ${className}`}
      aria-hidden
    />
  )
}

export function PlaylistListSkeleton() {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="歌单加载中">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[75%]" />
            <Skeleton className="h-3 w-[33%]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TrackListSkeleton() {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="歌曲加载中">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-3 w-6" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[66%]" />
            <Skeleton className="h-3 w-[40%]" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
