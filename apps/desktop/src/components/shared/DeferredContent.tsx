import { Suspense, type ReactNode, useEffect, useRef, useState } from "react";

interface DeferredContentProps {
  children: ReactNode;
  height: number;
  label: string;
  rootMargin?: string;
}

function ContentFallback({
  height,
  label,
}: Pick<DeferredContentProps, "height" | "label">) {
  return (
    <div
      className="flex w-full animate-pulse items-end gap-3 overflow-hidden rounded-xl bg-gray-50 px-6 pb-6 pt-10 dark:bg-zinc-900/60"
      style={{ height }}
      role="status"
      aria-label={label}
    >
      {[48, 72, 58, 86, 64, 77, 53].map((barHeight, index) => (
        <span
          key={`${barHeight}-${index}`}
          className="min-w-0 flex-1 rounded-t-md bg-gray-200 dark:bg-zinc-800"
          style={{ height: `${barHeight}%` }}
        />
      ))}
    </div>
  );
}

export function DeferredContent({
  children,
  height,
  label,
  rootMargin = "320px 0px",
}: DeferredContentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || shouldRender) return;

    if (!("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  const fallback = <ContentFallback height={height} label={label} />;

  return (
    <div ref={containerRef} style={{ minHeight: height }}>
      {shouldRender ? (
        <Suspense fallback={fallback}>{children}</Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
