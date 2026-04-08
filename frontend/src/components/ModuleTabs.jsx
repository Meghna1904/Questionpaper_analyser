export default function ModuleTabs({ active, onChange, syllabus, questionsByModule }) {
  const modules = [
    { id: 'all', label: 'All Modules', count: Object.values(questionsByModule).flat().length },
    ...([1, 2, 3, 4, 5].map(n => ({
      id: String(n),
      label: `M${n} — ${syllabus[n]?.title?.substring(0, 20) || `Module ${n}`}`,
      count: (questionsByModule[String(n)] || []).length,
    }))),
  ]

  return (
    <nav className="module-tabs" role="tablist">
      {modules.map(m => (
        <button
          key={m.id}
          role="tab"
          aria-selected={active === m.id}
          className={`module-tab ${active === m.id ? 'active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
          {m.count > 0 && (
            <span style={{
              marginLeft: '0.4rem',
              fontSize: '0.68rem',
              backgroundColor: active === m.id ? 'rgba(99,179,237,0.15)' : 'rgba(255,255,255,0.06)',
              padding: '1px 6px',
              borderRadius: '20px',
              color: active === m.id ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {m.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
