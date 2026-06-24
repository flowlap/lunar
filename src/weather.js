// Open-Meteo 날씨 예보 — 무료, API 키 불필요
// timezone=auto: 응답 시각이 현지 로컬 시간대로 반환됨

export async function fetchWeatherForecast(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloudcover,precipitation_probability&forecast_days=14&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// localNoonDate: makeLocalNoon()으로 생성된 Date
//   (Date.UTC(로컬년, 월, 일, 12) — getUTC* 값 = 로컬 날짜)
// 저녁 17~23시 중 최솟값(가장 맑은 시간대)을 반환 (0~100)
export function getNightCloudCover(weatherData, localNoonDate) {
  if (!weatherData?.hourly?.time) return null
  const { time, cloudcover } = weatherData.hourly

  const y = localNoonDate.getUTCFullYear()
  const m = String(localNoonDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(localNoonDate.getUTCDate()).padStart(2, '0')
  const prefix = `${y}-${m}-${d}`

  const values = []
  for (let h = 17; h <= 23; h++) {
    const key = `${prefix}T${String(h).padStart(2, '0')}:00`
    const idx = time.indexOf(key)
    if (idx !== -1) values.push(cloudcover[idx])
  }

  if (!values.length) return null
  return Math.min(...values) // 촬영 가능한 최적 창(가장 맑은 시간대 기준)
}

export function getWeatherInfo(cloudCoverPct) {
  if (cloudCoverPct === null) return null
  if (cloudCoverPct < 20) return { icon: '☀️', label: '맑음',      score: 100, tagClass: 'tag-weather-clear' }
  if (cloudCoverPct < 40) return { icon: '🌤', label: '구름 조금', score: 80,  tagClass: 'tag-weather-good'  }
  if (cloudCoverPct < 60) return { icon: '⛅', label: '구름 많음', score: 50,  tagClass: 'tag-weather-fair'  }
  if (cloudCoverPct < 80) return { icon: '🌥', label: '흐림',      score: 20,  tagClass: 'tag-weather-poor'  }
  return                         { icon: '☁️', label: '흐린 날',   score: 0,   tagClass: 'tag-weather-bad'   }
}
