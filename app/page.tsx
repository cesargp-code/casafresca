'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import Forecast from '@/app/components/Forecast'

import TemperatureChart, { type ChartDataPoint } from '@/app/components/TemperatureChart'

interface TemperatureReading {
  id: string
  timestamp: string
  outdoor_temp: string
  indoor_temp: string
  temp_differential: string
}


type NotificationPermissionState = NotificationPermission | 'unsupported'

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const notificationPromptDismissedKey = 'casa-fresca-notification-prompt-dismissed'
const openWindowsThemeColor = '#589684'
const closeWindowsThemeColor = '#C11818'
const oneDayMs = 24 * 60 * 60 * 1000
const yesterdayComparisonToleranceMs = 90 * 60 * 1000

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

async function savePushSubscription(registration: ServiceWorkerRegistration) {
  if (!('PushManager' in window) || !registration.pushManager || !vapidPublicKey) {
    return false
  }

  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    } catch (error) {
      console.warn('Push subscription is not available in this browser:', error)
      return false
    }
  }

  const response = await fetch('/api/push-subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription,
      userAgent: navigator.userAgent,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.error || 'Could not save push subscription')
  }

  return true
}

export default function Home() {
  const [data, setData] = useState<TemperatureReading[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | 'forecast'>('24h')
  const [showMiau, setShowMiau] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>('default')
  const [notificationMessage, setNotificationMessage] = useState('')
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false)
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false)

  const fetchTemperatureData = useCallback(async () => {
    try {
      if (!supabase) {
        console.error('Supabase client not available')
        setLoading(false)
        return
      }

      const { data: readings, error } = await supabase
        .from('casa_fresca_readings')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 7 * oneDayMs).toISOString())
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
  }, [])

  useEffect(() => {
    fetchTemperatureData()
  }, [fetchTemperatureData])

  useEffect(() => {
    const refreshWhenForegrounded = () => {
      if (document.visibilityState === 'visible') {
        fetchTemperatureData()
      }
    }

    document.addEventListener('visibilitychange', refreshWhenForegrounded)
    window.addEventListener('focus', refreshWhenForegrounded)
    window.addEventListener('pageshow', refreshWhenForegrounded)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenForegrounded)
      window.removeEventListener('focus', refreshWhenForegrounded)
      window.removeEventListener('pageshow', refreshWhenForegrounded)
    }
  }, [fetchTemperatureData])

  useEffect(() => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }

    const permission = Notification.permission
    const promptDismissed = localStorage.getItem(notificationPromptDismissedKey) === 'true'

    setNotificationPermission(permission)
    setShowNotificationPrompt(permission === 'default' && !promptDismissed)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async (registration) => {
        if (permission === 'granted') {
          await savePushSubscription(registration).catch((error) => {
            console.warn('Could not refresh push subscription:', error)
          })
        }
      }).catch((error) => {
        console.warn('Could not register service worker:', error)
      })
    }
  }, [])

  const findClosestReading = (
    readings: TemperatureReading[],
    targetTime: number,
    maxDifferenceMs: number
  ) => {
    return readings.reduce<TemperatureReading | null>((closest, reading) => {
      const readingTime = new Date(reading.timestamp).getTime()
      const readingDiff = Math.abs(readingTime - targetTime)

      if (readingDiff > maxDifferenceMs) {
        return closest
      }

      if (!closest) {
        return reading
      }

      const closestTime = new Date(closest.timestamp).getTime()
      const closestDiff = Math.abs(closestTime - targetTime)

      return readingDiff < closestDiff ? reading : closest
    }, null)
  }

  const formatData = (data: TemperatureReading[]): ChartDataPoint[] => {
    const now = new Date()
    const cutoffTime = timeRange === '24h' 
      ? new Date(now.getTime() - oneDayMs)
      : new Date(now.getTime() - 7 * oneDayMs)
    
    const filteredData = data.filter(reading => 
      new Date(reading.timestamp) >= cutoffTime
    )
    
    return filteredData.map(reading => {
      const readingDate = new Date(reading.timestamp)
      const yesterdayReading = timeRange === '24h'
        ? findClosestReading(data, readingDate.getTime() - oneDayMs, yesterdayComparisonToleranceMs)
        : null

      return {
        time: readingDate.toLocaleString('es-ES', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
        }),
        originalTimestamp: reading.timestamp,
        outdoor: parseFloat(reading.outdoor_temp),
        indoor: parseFloat(reading.indoor_temp),
        yesterdayOutdoor: yesterdayReading ? parseFloat(yesterdayReading.outdoor_temp) : null,
        yesterdayIndoor: yesterdayReading ? parseFloat(yesterdayReading.indoor_temp) : null
      }
    })
  }

  const formattedData = useMemo(() => formatData(data), [data, timeRange])

  const handleCatClick = useCallback(() => {
    setShowMiau(true)
    setTimeout(() => {
      setShowMiau(false)
    }, 1000)
  }, [])

  const handleEnableNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      setNotificationMessage('Este navegador no permite avisos web.')
      setShowNotificationPrompt(false)
      localStorage.setItem(notificationPromptDismissedKey, 'true')
      return
    }

    if (!window.isSecureContext) {
      setNotificationMessage('Los avisos necesitan HTTPS o localhost.')
      return
    }

    setIsEnablingNotifications(true)
    setNotificationMessage('')

    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)

      if (permission !== 'granted') {
        localStorage.setItem(notificationPromptDismissedKey, 'true')
        setShowNotificationPrompt(false)
        setNotificationMessage(
          permission === 'denied'
            ? 'Permiso bloqueado. Activalo desde los ajustes del navegador.'
            : 'Permiso pendiente. Toca el boton cuando quieras activar avisos.'
        )
        return
      }

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready

        const savedPushSubscription = await savePushSubscription(registration)

        if (!savedPushSubscription) {
          setNotificationMessage('Permiso activado, pero este navegador no ofrece servicio push.')
          localStorage.setItem(notificationPromptDismissedKey, 'true')
          return
        }

        await registration.showNotification('Casa Fresca activado', {
          body: 'Te podremos avisar cuando convenga abrir o cerrar ventanas.',
          icon: '/casa_fresca.png',
          badge: '/casa_fresca.png',
          tag: 'casa-fresca-notifications-ready',
        })
      } else {
        new Notification('Casa Fresca activado', {
          body: 'Te podremos avisar cuando convenga abrir o cerrar ventanas.',
          icon: '/casa_fresca.png',
        })
      }

      setNotificationMessage(
        vapidPublicKey
          ? 'Avisos activados en este dispositivo.'
          : 'Permiso activado. Falta configurar VAPID para enviar avisos automaticos.'
      )
      localStorage.setItem(notificationPromptDismissedKey, 'true')
      setShowNotificationPrompt(false)
    } catch (error) {
      console.warn('Error enabling notifications:', error)
      setNotificationMessage('No se pudieron activar los avisos. Intentalo otra vez.')
    } finally {
      setIsEnablingNotifications(false)
    }
  }, [])

  const handleDismissNotificationPrompt = useCallback(() => {
    localStorage.setItem(notificationPromptDismissedKey, 'true')
    setShowNotificationPrompt(false)
    setNotificationMessage('')
  }, [])

  const latestReading = data[data.length - 1]
  const MIN_COMFORTABLE_TEMP = 18
  const shouldCloseWindows = latestReading ? 
    (parseFloat(latestReading.outdoor_temp) > parseFloat(latestReading.indoor_temp)) || (parseFloat(latestReading.outdoor_temp) < MIN_COMFORTABLE_TEMP) : false

  useEffect(() => {
    const themeColor = shouldCloseWindows ? closeWindowsThemeColor : openWindowsThemeColor
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.name = 'theme-color'
      document.head.appendChild(themeMeta)
    }

    themeMeta.content = themeColor
  }, [shouldCloseWindows])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans">
        <div className="text-lg">Refrescando CASA FRESCA...</div>
      </div>
    )
  }

  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean(navigator.standalone))
  )
  const needsIosInstall = isIos && !isStandalone

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
    const diff = current - past
    
    return { absoluteDiff: Math.abs(diff), isIncrease: diff > 0 }
  }

  const getImageUrl = (imageName: string) => {
    if (!supabase) return ''
    const { data } = supabase.storage
      .from('casa-fresca-assets')
      .getPublicUrl(imageName)
    return data.publicUrl
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="mx-auto w-full max-w-6xl">
        {/* The three pieces shrink together on mobile and separate without stretching on wide screens. */}
        <header className="flex w-full items-center overflow-hidden" aria-label="Casa Fresca">
          <div className="flex min-w-0 flex-[1_1_310px] justify-start">
            <Image
              src="/header-night.png"
              alt=""
              width={310}
              height={295}
              priority
              className="h-auto w-full max-w-[310px] md:w-[155px]"
            />
          </div>
          <div className="flex min-w-0 flex-[0_1_385px] justify-center">
            <Image
              src="/header-title.png"
              alt="Casa Fresca"
              width={385}
              height={295}
              priority
              className="h-auto w-full max-w-[385px] md:w-[193px]"
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_310px] justify-end">
            <Image
              src="/header-sunrise.png"
              alt=""
              width={310}
              height={295}
              priority
              className="h-auto w-full max-w-[310px] md:w-[155px]"
            />
          </div>
        </header>

        {/* Temperature readings and window recommendation */}
        <div className="mx-auto mb-6 mt-5 max-w-xl px-4">
          <table className="w-full text-center">
            <tbody>
              <tr>
                <td className="text-sm" style={{ color: '#6B7280' }}>DENTRO</td>
                <td rowSpan={3} className="w-24 align-middle">
                  <div className="flex justify-center">
                    <img 
                      src={getImageUrl(shouldCloseWindows ? 'windows_closed.png' : 'windows_open.png')} 
                      alt={shouldCloseWindows ? 'Close windows' : 'Open windows'} 
                      className="w-20 h-20 object-contain"
                    />
                  </div>
                </td>
                <td className="text-sm" style={{ color: '#6B7280' }}>FUERA</td>
              </tr>
              <tr>
                <td className="font-bold text-3xl whitespace-nowrap" style={{color: '#589684'}}>
                  {latestReading ? parseFloat(latestReading.indoor_temp).toFixed(1) : '--'}&nbsp;°C
                </td>
                <td className="font-bold text-3xl whitespace-nowrap" style={{color: '#C11818'}}>
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
                          <span style={{ color: diff.isIncrease ? '#DD9378' : '#7FB9D8' }}>
                            {diff.absoluteDiff.toFixed(1)}{diff.isIncrease ? ' +' : ' -'}
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
                          <span style={{ color: diff.isIncrease ? '#DD9378' : '#7FB9D8' }}>
                            {diff.absoluteDiff.toFixed(1)}{diff.isIncrease ? ' +' : ' -'}
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
        <div className="p-0 md:px-4 lg:px-6">
          {timeRange === 'forecast' ? <Forecast /> : <TemperatureChart
            formattedData={formattedData}
            showYesterdayOverlay={timeRange === '24h'}
          />}

          {/* Last updated timestamp */}
          {latestReading && timeRange !== 'forecast' && (
            <p className="text-center text-sm text-gray-500 mb-6">
              actualizado a las {new Date(latestReading.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })}
            </p>
          )}

          {/* Time range segmented control */}
          <div className="mx-4 mb-6 flex rounded-lg bg-gray-100 p-1 sm:mx-auto sm:max-w-md">
            <button
              onClick={() => setTimeRange('7d')}
              aria-pressed={timeRange === '7d'}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              7 días atrás
            </button>
            <button
              onClick={() => setTimeRange('24h')}
              aria-pressed={timeRange === '24h'}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                timeRange === '24h'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              24 horas
            </button>
            <button
              onClick={() => setTimeRange('forecast')}
              aria-pressed={timeRange === 'forecast'}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${timeRange === 'forecast' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Previsión
            </button>
          </div>

          <p className="mb-0 text-center text-sm" style={{color: '#bbb'}}>Casa Fresca - León, España<br />
Sistema de gestión de temperatura para dormir bien</p>
          {/* Cat image at bottom */}
          <div className="flex justify-center relative">
            <img 
              src={getImageUrl('cat.png')} 
              alt="Cat" 
              className="h-auto w-1/2 max-w-56 cursor-pointer"
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

      {showNotificationPrompt && notificationPermission === 'default' && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
          <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
            <p className="text-sm font-semibold text-gray-900">Avisos en el movil</p>
            <p className="mt-2 text-sm text-gray-600">
              Casa Fresca puede avisarte cuando toque abrir o cerrar ventanas.
            </p>
            {needsIosInstall && (
              <p className="mt-3 text-xs text-gray-500">
                En iPhone, anade Casa Fresca a la pantalla de inicio para activar avisos.
              </p>
            )}
            {notificationMessage && (
              <p className="mt-3 text-xs text-gray-500">{notificationMessage}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleDismissNotificationPrompt}
                className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={needsIosInstall ? handleDismissNotificationPrompt : handleEnableNotifications}
                disabled={isEnablingNotifications}
                className="flex-1 rounded-md bg-[#589684] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#477b6d] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isEnablingNotifications
                  ? 'Activando...'
                  : needsIosInstall
                    ? 'Entendido'
                    : 'Activar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
