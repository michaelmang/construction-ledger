export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</div>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-text">{title}</h1>
      </div>
      {action}
    </div>
  );
}
