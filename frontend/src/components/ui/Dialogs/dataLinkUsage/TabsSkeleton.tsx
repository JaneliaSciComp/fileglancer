export default function TabsSkeleton() {
  return (
    <div className="w-[95%] self-center animate-pulse">
      <div className="flex gap-2 py-2 px-2 rounded-t-lg bg-surface dark:bg-surface-light">
        <div className="w-16 h-8 bg-surface-light dark:bg-surface rounded" />
        <div className="w-16 h-8 bg-surface-light dark:bg-surface rounded" />
        <div className="w-20 h-8 bg-surface-light dark:bg-surface rounded" />
        <div className="w-16 h-8 bg-surface-light dark:bg-surface rounded" />
      </div>
      <div className="flex flex-col gap-3 p-4 rounded-b-lg border border-t-0 border-surface dark:border-foreground/30 bg-surface-light dark:bg-surface">
        <div className="w-full h-4 bg-surface dark:bg-surface-light rounded" />
        <div className="w-3/4 h-4 bg-surface dark:bg-surface-light rounded" />
        <div className="w-5/6 h-4 bg-surface dark:bg-surface-light rounded" />
        <div className="w-2/3 h-4 bg-surface dark:bg-surface-light rounded" />
        <div className="w-full h-4 bg-surface dark:bg-surface-light rounded" />
        <div className="w-4/5 h-4 bg-surface dark:bg-surface-light rounded" />
      </div>
    </div>
  );
}
