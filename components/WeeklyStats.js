'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

export default function WeeklyStats({ logs, data: preloadedData, totalMinutes: preloadedTotal }) {
  // Process logs to get data for the current week (Sunday to Saturday)
  const processData = () => {
    if (preloadedData) return preloadedData

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const today = new Date()
    // Calculate start of week (Sunday)
    const dayOfWeek = today.getDay() 
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek)
    
    // Reset time to ensure clean date comparison
    startOfWeek.setHours(0, 0, 0, 0)

    const weekData = []

    // Helper to check if two dates are same day (local time)
    const isSameDay = (d1, d2) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate()
    }

    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(startOfWeek)
        currentDay.setDate(startOfWeek.getDate() + i)

        const label = days[currentDay.getDay()]
        
        // Filter logs for this day
        const dayLogs = logs ? logs.filter(log => {
            const logDate = new Date(log.created_at)
            return isSameDay(logDate, currentDay)
        }) : []
      
      const learningMinutes = dayLogs
        .filter(l => l.session_type === 'learning')
        .reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)
        
      const reviewMinutes = dayLogs
        .filter(l => l.session_type === 'review')
        .reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)

      weekData.push({
        name: label,
        learning: learningMinutes,
        review: reviewMinutes
      })
    }
    return weekData
  }

  const chartData = processData()
  const displayTotal = preloadedTotal !== undefined 
    ? preloadedTotal 
    : (logs ? logs.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0) : 0)

  return (
    <Card className="glass-card shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Weekly Activity</CardTitle>
            <div className="text-xs text-muted-foreground font-mono">
                Total: {Math.round(displayTotal)} mins
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          {(!chartData.some(d => d.learning > 0 || d.review > 0)) ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No activity recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                <XAxis 
                    dataKey="name" 
                    stroke="#71717a" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                />
                <YAxis 
                    stroke="#71717a" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `${value}m`}
                />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fafafa' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                />
                <Bar dataKey="learning" stackId="a" fill="#0ea5e9" radius={[0, 0, 4, 4]} />
                <Bar dataKey="review" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex gap-4 justify-center mt-4 text-xs">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                <span className="text-muted-foreground">Learning</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span className="text-muted-foreground">Reviewing</span>
            </div>
        </div>
      </CardContent>
    </Card>
  )
}
