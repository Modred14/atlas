export default function SectionHeader({ eyebrow, title, description, icon: Icon, action }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 px-1">
      <div className="min-w-0">
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            {Icon && <Icon size={12} strokeWidth={2.4} />}
            {eyebrow}
          </div>
        )}
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}