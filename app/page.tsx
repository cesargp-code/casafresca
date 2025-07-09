'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'

interface TemperatureReading {
  id: string
  timestamp: string
  outdoor_temp: string
  indoor_temp: string
  temp_differential: string
}

export default function Home() {
  const [data, setData] = useState<TemperatureReading[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h')
  const [showMiau, setShowMiau] = useState(false)

  useEffect(() => {
    fetchTemperatureData()
  }, [])

  const fetchTemperatureData = async () => {
    try {
      if (!supabase) {
        console.error('Supabase client not available')
        setLoading(false)
        return
      }

      const { data: readings, error } = await supabase
        .from('casa_fresca_readings')
        .select('*')
        .order('timestamp', { ascending: true })

      if (error) {
        console.error('Error fetching data:', error)
      } else {
        setData(readings || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatData = (data: TemperatureReading[]) => {
    const now = new Date()
    const cutoffTime = timeRange === '24h' 
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const filteredData = data.filter(reading => 
      new Date(reading.timestamp) >= cutoffTime
    )
    
    return filteredData.map(reading => ({
      time: new Date(reading.timestamp).toLocaleString('es-ES', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      outdoor: parseFloat(reading.outdoor_temp),
      indoor: parseFloat(reading.indoor_temp)
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans">
        <div className="text-lg">Refrescando CASA FRESCA...</div>
      </div>
    )
  }

  const latestReading = data[data.length - 1]
  const shouldCloseWindows = latestReading ? 
    parseFloat(latestReading.outdoor_temp) > parseFloat(latestReading.indoor_temp) : false

  // Calculate temperature difference from 24h ago
  const get24hDifference = (currentTemp: string, isIndoor: boolean) => {
    if (!latestReading) return null
    
    const currentTime = new Date(latestReading.timestamp)
    const twentyFourHoursAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000)
    
    // Find the reading closest to 24h ago
    const reading24hAgo = data.reduce((closest, reading) => {
      const readingTime = new Date(reading.timestamp)
      const closestTime = new Date(closest.timestamp)
      
      const readingDiff = Math.abs(readingTime.getTime() - twentyFourHoursAgo.getTime())
      const closestDiff = Math.abs(closestTime.getTime() - twentyFourHoursAgo.getTime())
      
      return readingDiff < closestDiff ? reading : closest
    }, data[0])
    
    if (!reading24hAgo) return null
    
    const current = parseFloat(currentTemp)
    const past = parseFloat(isIndoor ? reading24hAgo.indoor_temp : reading24hAgo.outdoor_temp)
    const diff = past - current
    
    return diff
  }

  const getImageUrl = (imageName: string) => {
    if (!supabase) return ''
    const { data } = supabase.storage
      .from('casa-fresca-assets')
      .getPublicUrl(imageName)
    return data.publicUrl
  }

  const handleCatClick = () => {
    setShowMiau(true)
    setTimeout(() => {
      setShowMiau(false)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="max-w-md mx-auto">
        {/* Top banner image */}
        <div className="w-full">
          <img 
            src={getImageUrl('top_new.png')} 
            alt="Casa Fresca" 
            className="w-full h-auto"
          />
        </div>

        {/* Temperature readings and window recommendation */}
        <div className="mb-6 px-4 mt-5">
          <table className="w-full text-center">
            <tbody>
              <tr>
                <td className="text-sm">DENTRO</td>
                <td rowSpan={3} className="w-24 align-middle">
                  <div className="flex justify-center">
                    <img 
                      src={getImageUrl(shouldCloseWindows ? 'windows_closed.png' : 'windows_open.png')} 
                      alt={shouldCloseWindows ? 'Close windows' : 'Open windows'} 
                      className="w-20 h-20 object-contain"
                    />
                  </div>
                </td>
                <td className="text-sm">FUERA</td>
              </tr>
              <tr>
                <td className="font-bold text-3xl whitespace-nowrap" style={{color: shouldCloseWindows ? '#7FB9D8' : '#DD9378'}}>
                  {latestReading ? parseFloat(latestReading.indoor_temp).toFixed(1) : '--'}&nbsp;°C
                </td>
                <td className="font-bold text-3xl whitespace-nowrap" style={{color: shouldCloseWindows ? '#DD9378' : '#7FB9D8'}}>
                  {latestReading ? parseFloat(latestReading.outdoor_temp).toFixed(1) : '--'}&nbsp;°C
                </td>
              </tr>
              <tr>
                <td className="text-sm text-gray-500">
                  {latestReading && data.length > 1 ? (
                    (() => {
                      const diff = get24hDifference(latestReading.indoor_temp, true)
                      return diff !== null ? (
                        <>
                          <span style={{ color: diff < 0 ? '#DD9378' : '#7FB9D8' }}>
                          {(-diff).toFixed(1)}{diff < 0 ? ' más' : 'menos'}
                          </span>
                          {' que ayer'}
                        </>
                      ) : ''
                    })()
                  ) : ''}
                </td>
                <td className="text-sm text-gray-500">
                  {latestReading && data.length > 1 ? (
                    (() => {
                      const diff = get24hDifference(latestReading.outdoor_temp, false)
                      return diff !== null ? (
                        <>
                          <span style={{ color: diff < 0 ? '#DD9378' : '#7FB9D8' }}>
                            {(-diff).toFixed(1)}{diff < 0 ? ' más' : 'menos'}
                          </span>
                          {' que ayer'}
                        </>
                      ) : ''
                    })()
                  ) : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Temperature chart */}
        <div className="p-0">
          <div className="h-64 mb-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={formatData(data)} 
                margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
              >
                <CartesianGrid horizontal={true} vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10 }}
                  domain={['dataMin', 'dataMax']}
                  ticks={[formatData(data)[formatData(data).length - 1]?.time]}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      hour12: false 
                    });
                  }}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  width={30}
                />
                <Tooltip 
                  formatter={(value: any) => [
                    typeof value === 'number' ? value.toFixed(1) + '°C' : value
                  ]}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{ 
                    fontSize: '12px', 
                    padding: '4px 6px',
                    minWidth: 'auto'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="outdoor" 
                  stroke="#C11818" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="indoor" 
                  stroke="#589684" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Time range segmented control */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6 mx-4">
            <button
              onClick={() => setTimeRange('7d')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              7 días
            </button>
            <button
              onClick={() => setTimeRange('24h')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                timeRange === '24h'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              24 horas
            </button>
          </div>

          <p className="text-center text-sm mb-0" style={{color: '#bbb'}}>Casa Fresca - León, España<br />
Sistema de gestión de temperatura para dormir bien</p>
          {/* Cat image at bottom */}
          <div className="flex justify-center relative">
            <img 
              src={getImageUrl('cat.png')} 
              alt="Cat" 
              className="w-1/2 h-auto cursor-pointer"
              onClick={handleCatClick}
            />
            {showMiau && (
              <div 
                className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2"
                style={{
                  animation: 'fadeUpAndOut 1.0s ease-out forwards'
                }}
              >
                <div className="rounded-lg px-2 py-1 relative shadow-lg" style={{ backgroundColor: '#F4EBD2' }}>
                  <span className="text-black text-sm">¡Miau!</span>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-t-6 border-l-transparent border-r-transparent" style={{ borderTopColor: '#F4EBD2' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}