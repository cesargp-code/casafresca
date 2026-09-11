'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

export interface ChartDataPoint {
  time: string
  originalTimestamp: string
  outdoor: number
  indoor: number | null
  yesterdayOutdoor: number | null
  yesterdayIndoor: number | null
}

const TemperatureChart = memo(({
  formattedData,
  showYesterdayOverlay,
  forecast = false,
  tomorrowTemperatures
}: {
  formattedData: ChartDataPoint[]
  showYesterdayOverlay: boolean
  forecast?: boolean
  tomorrowTemperatures?: Array<number | null>
}) => {
  const showTomorrow = showYesterdayOverlay && tomorrowTemperatures?.some(value => value !== null)
  
  const chartOptions = {
    chart: {
      type: 'line' as const,
      height: 256,
      toolbar: {
        show: false
      },
      zoom: {
        enabled: false
      },
      selection: {
        enabled: false
      },
      brush: {
        enabled: false
      },
      events: {},
      background: 'transparent',
      fontFamily: 'inherit',
      offsetX: 5,
      offsetY: 5,
      animations: {
        enabled: true,
        easing: 'linear',
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      }
    },
    stroke: {
      width: showTomorrow ? [2, 2, 2, 2, 2] : showYesterdayOverlay ? [2, 2, 2, 2] : 2,
      dashArray: showTomorrow ? [0, 0, 0, 0, 5] : forecast ? 5 : 0,
      curve: 'monotoneCubic' as const
    },
    colors: showYesterdayOverlay
      ? ['#C11818', '#589684', 'rgba(193, 24, 24, 0.22)', 'rgba(88, 150, 132, 0.22)', 'rgba(193, 24, 24, 0.5)']
      : ['#C11818', '#589684'],
    grid: {
      show: true,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      },
      borderColor: '#e5e7eb',
      strokeDashArray: 0,
      padding: {
        top: 5,
        right: 15,
        bottom: 5,
        left: 5
      }
    },
    xaxis: {
      categories: formattedData.map(d => d.time),
      tickAmount: 2,
      labels: {
        style: {
          fontSize: '10px',
          fontFamily: 'inherit'
        },
        show: true,
        rotate: 0,
        formatter: function(_value: string, index?: number) {
          // Only show the last timestamp (rightmost), similar to original
          const isLast = index === formattedData.length - 1;
          if (isLast && formattedData.length > 0) {
            const lastDataPoint = formattedData[formattedData.length - 1];
            if (lastDataPoint && lastDataPoint.originalTimestamp) {
              const date = new Date(lastDataPoint.originalTimestamp);
              return date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              });
            }
          }
          return '';
        },
        showDuplicates: false
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      
      crosshairs: {
        show: false
      },
      tooltip: {
        enabled: false
      },
      min: undefined,
      max: undefined
    },
    yaxis: {
      labels: {
        style: {
          fontSize: '10px',
          fontFamily: 'inherit'
        },
        offsetX: -15,
        formatter: function(value: number) {
          return Math.round(value) + '°C';
        }
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      crosshairs: {
        show: false
      },
      tooltip: {
        enabled: false
      }
    },
    tooltip: {
      shared: true,
      intersect: false,
      enabledOnSeries: [0, 1],
      followCursor: false,
      cssClass: 'casa-fresca-chart-tooltip',
      style: {
        fontSize: '12px'
      },
      marker: {
        show: false
      },
      x: {
        show: false
      },
      custom: function({ series, dataPointIndex, w }: any) {
        const outdoor = series[0][dataPointIndex];
        const indoor = series[1]?.[dataPointIndex];
        
        // Get the original data point to access the full timestamp
        const originalDataPoint = formattedData[dataPointIndex];
        let fullDateTime = '';
        
        if (originalDataPoint && originalDataPoint.originalTimestamp) {
          const date = new Date(originalDataPoint.originalTimestamp);
          fullDateTime = date.toLocaleString('es-ES', {
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        } else {
          fullDateTime = originalDataPoint ? originalDataPoint.time : w.globals.categoryLabels[dataPointIndex];
        }
        
        return `
          <div style="padding: 4px 6px; font-size: 12px; min-width: auto; background: white; color: #6B7280; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 2px; color: #6B7280;">${fullDateTime}</div>
            ${forecast ? '' : `<div style="color: #589684; margin: 1px 0;">
              ${typeof indoor === 'number' ? indoor.toFixed(1) : '--'}°C
            </div>`}
            <div style="color: #C11818; margin: 1px 0;">
              ${typeof outdoor === 'number' ? outdoor.toFixed(1) : '--'}°C
            </div>
          </div>
        `;
      }
    },
    markers: {
      size: 0
    },
    legend: {
      show: false
    },
    dataLabels: {
      enabled: false
    },
    states: {
      hover: {
        filter: {
          type: 'none'
        }
      },
      active: {
        allowMultipleDataPointsSelection: false,
        filter: {
          type: 'none'
        }
      }
    }
  };

  const chartSeries: { name: string; data: Array<number | null> }[] = [
    {
      name: 'Outdoor',
      data: formattedData.map(d => d.outdoor)
    },
    {
      name: 'Indoor', 
      data: formattedData.map(d => d.indoor)
    }
  ];

  if (showYesterdayOverlay) {
    chartSeries.push(
      {
        name: 'Outdoor ayer',
        data: formattedData.map(d => d.yesterdayOutdoor)
      },
      {
        name: 'Indoor ayer',
        data: formattedData.map(d => d.yesterdayIndoor)
      }
    )
  }

  if (showTomorrow && tomorrowTemperatures) {
    chartSeries.push({ name: 'Exterior mañana', data: tomorrowTemperatures })
  }

  return (
    <div className="h-64 overflow-hidden md:h-72 lg:h-80">
      <Chart
        options={chartOptions}
        series={forecast ? chartSeries.slice(0, 1) : chartSeries}
        type="line"
        height="100%"
        width="100%"
      />
    </div>
  );
})


export default TemperatureChart
