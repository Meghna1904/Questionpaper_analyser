import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = [
  '#fc8181', '#f6ad55', '#68d391', '#63b3ed',
  '#9f7aea', '#76e4f7', '#fbd38d', '#b794f4',
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '0.65rem 1rem',
      fontSize: '0.8rem',
    }}>
      <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{label}</p>
      <p style={{ color: 'var(--accent)' }}>
        {payload[0].value} occurrence{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

export default function FrequencyChart({ topics }) {
  if (!topics || topics.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem' }}>
        <div className="empty-icon">📊</div>
        <p>No data to display.</p>
      </div>
    )
  }

  const data = topics.map(t => ({
    name: t.topic.length > 18 ? t.topic.substring(0, 16) + '…' : t.topic,
    fullName: t.topic,
    count: t.raw_count,
  }))

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
