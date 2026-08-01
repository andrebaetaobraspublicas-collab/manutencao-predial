export function BarList({
  items,
  emptyLabel = 'Sem dados no período.',
}: {
  items: Array<{ label: string; total: number }>;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.total));
  if (!items.length) return <p className="table-secondary">{emptyLabel}</p>;

  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label" title={item.label}>
            {item.label}
          </span>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${(item.total / max) * 100}%` }} />
          </div>
          <span className="bar-value">{item.total}</span>
        </div>
      ))}
    </div>
  );
}
