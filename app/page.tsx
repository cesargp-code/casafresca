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

  useEffect(() => {
    fetchTemperatureData()
  }, [])

  const fetchTemperatureData = async () => {
    try {
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
    return data.map(reading => ({
      time: new Date(reading.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      outdoor: parseFloat(reading.outdoor_temp),
      indoor: parseFloat(reading.indoor_temp)
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading temperature data...</div>
      </div>
    )
  }

  const latestReading = data[data.length - 1]
  const shouldCloseWindows = latestReading ? 
    parseFloat(latestReading.outdoor_temp) > parseFloat(latestReading.indoor_temp) : false

  const getImageUrl = (imageName: string) => {
    const { data } = supabase.storage
      .from('casa-fresca-assets')
      .getPublicUrl(imageName)
    return data.publicUrl
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="max-w-sm mx-auto">
        {/* Top banner image */}
        <div className="w-full">
          <img 
            src={getImageUrl('top_new.png')} 
            alt="Casa Fresca" 
            className="w-full h-auto"
          />
        </div>

        {/* Temperature readings and window recommendation */}
        <div className="mb-6 flex items-center px-4 mt-5">
          <div className="w-16 h-16 flex-shrink-0">
            <img 
              src={getImageUrl(shouldCloseWindows ? 'windows_closed.png' : 'windows_open.png')} 
              alt={shouldCloseWindows ? 'Close windows' : 'Open windows'} 
              className="w-full h-full object-contain"
            />
          </div>
          
          <div className="flex-1 ml-4">
            <table className="w-full text-center">
              <tbody>
                <tr>
                  <td className="text-sm">DENTRO</td>
                  <td></td>
                  <td className="text-sm">FUERA</td>
                </tr>
                <tr>
                  <td className="font-bold text-4xl whitespace-nowrap" style={{color: shouldCloseWindows ? '#7FB9D8' : '#DD9378'}}>
                    {latestReading ? parseFloat(latestReading.indoor_temp).toFixed(1) : '--'}&nbsp;°C
                  </td>
                  <td className="w-1/3">
                    <div className="text-2xl mt-1 font-sans" style={{color: '#bbb'}}>
                      {shouldCloseWindows ? '<' : '>'}
                    </div>
                  </td>
                  <td className="font-bold text-4xl whitespace-nowrap" style={{color: shouldCloseWindows ? '#DD9378' : '#7FB9D8'}}>
                    {latestReading ? parseFloat(latestReading.outdoor_temp).toFixed(1) : '--'}&nbsp;°C
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Temperature chart */}
        <div className="p-0">
          <div className="h-64 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formatData(data)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
                />
                <Tooltip 
                  formatter={(value: any) => [
                    typeof value === 'number' ? value.toFixed(1) + '°C' : value,
                    ''
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="outdoor" 
                  stroke="#589684" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="indoor" 
                  stroke="#B27760" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-sm mb-4" style={{color: '#bbb'}}>Casa Fresca - León, España<br />
Sistema de gestión de temperatura para dormir bien</p>
          {/* Cat image at bottom */}
          <div className="flex justify-center">
            <img 
              src={getImageUrl('cat.png')} 
              alt="Cat" 
              className="w-1/2 h-auto"
            />
          </div>
        </div>
      </div>
    </div>
  )
}