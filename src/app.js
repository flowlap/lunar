import { getCurrentPosition, watchPosition } from './location.js'
import { getMoonData, getNextMoonrise, getMoonTimes, getMoonDistanceData, getDayAltitudes, getMonthPhases, getNextFullMoon, getPhotographyRecommendations } from './moon.js'
import { initCompass, updateCompass, renderAltitude, renderTrajectory } from './compass.js'
import { getOrientationSupport, requestOrientationPermission, startWatchingHeading, stopWatchingHeading } from './orientation.js'
import { fetchWeatherForecast, getNightCloudCover, getWeatherInfo } from './weather.js'

const APP_VERSION = '1.6'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
  // 새 서비스 워커 활성화 시 자동 새로고침 — 항상 최신 파일 보장
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') window.location.reload()
  })
}

const state = {
  position: null,
  moonData: null,
  deviceHeading: null,
  updateTimer: null,
  watchId: null,
  timezone: null,
  photoType: 'full',
  weatherData: null,
  weatherLoading: false,
}

const $ = id => document.getElementById(id)
const els = {
  loadingScreen: $('loading-screen'),
  errorScreen: $('error-screen'),
  mainScreen: $('main-screen'),
  errorMessage: $('error-message'),
  manualForm: $('manual-location-form'),
  inputLat: $('input-lat'),
  inputLon: $('input-lon'),
  compassContainer: $('compass-container'),
  altitudeContainer: $('altitude-container'),
  infoDirection: $('info-direction'),
  infoAzimuth: $('info-azimuth'),
  infoAltitude: $('info-altitude'),
  infoPhase: $('info-phase'),
  belowHorizonMsg: $('below-horizon-msg'),
  compassPermissionBtn: $('compass-permission-btn'),
  updateTime: $('update-time'),
  infoCoords: $('info-coords'),
  infoMoonrise: $('info-moonrise'),
  infoMoonset: $('info-moonset'),
  infoDistance: $('info-distance'),
  infoDistanceDiff: $('info-distance-diff'),
  supermoonBadge: $('supermoon-badge'),
  minimoonBadge: $('minimoon-badge'),
  infoIllum: $('info-illum'),
  infoTodayWeather: $('info-today-weather'),
  trajectoryContainer: $('trajectory-container'),
  infoFullmoon: $('info-fullmoon'),
  phaseCalendar: $('phase-calendar'),
}

function showScreen(name) {
  els.loadingScreen.classList.toggle('hidden', name !== 'loading')
  els.errorScreen.classList.toggle('hidden', name !== 'error')
  els.mainScreen.classList.toggle('hidden', name !== 'main')
}

const messages = {
  PERMISSION_DENIED: 'GPS 접근이 거부되었습니다. 위치를 직접 입력해 주세요.',
  POSITION_UNAVAILABLE: 'GPS 신호를 찾을 수 없습니다.',
  TIMEOUT: 'GPS 응답 시간이 초과되었습니다.',
  GEOLOCATION_NOT_SUPPORTED: '이 브라우저는 GPS를 지원하지 않습니다.',
}

function showError(message) {
  els.errorMessage.textContent = messages[message] || message
  showScreen('error')
}

// 로컬 날짜 기준 UTC 정오 생성 — SunCalc에 넘길 날짜의 UTC 경계 문제 방지
function makeLocalNoon(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date)
    const get = t => +parts.find(p => p.type === t).value
    return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 12, 0, 0))
  } catch {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
  }
}

// GPS 좌표로 IANA 타임존 조회 (실패 시 기기 타임존 사용)
async function fetchTimezone(lat, lon) {
  try {
    const res = await fetch(
      `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.timeZone || null
  } catch {
    return null
  }
}

// GPS 좌표의 타임존 기준 시각 포맷
function makeFmt(tz) {
  return d => d
    ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    : '—'
}

async function updateMoonDisplay() {
  if (!state.position) return

  const { latitude, longitude, accuracy } = state.position
  const now = new Date()
  const tz = state.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const fmtTime = makeFmt(tz)

  const localNoon = makeLocalNoon(now, tz)
  const tomorrowNoon = new Date(localNoon.getTime() + 24 * 3600000)

  const moonData = getMoonData(now, latitude, longitude)
  state.moonData = moonData

  const { azimuthDeg, altitudeDeg, directionLabel, phaseIcon, phaseLabel, isVisible } = moonData

  updateCompass({ moonAzimuth: azimuthDeg, moonAltitude: altitudeDeg, deviceHeading: state.deviceHeading })
  renderAltitude(els.altitudeContainer, altitudeDeg)

  els.infoDirection.textContent = directionLabel + ' (' + azimuthDeg.toFixed(1) + '°)'
  els.infoAzimuth.textContent = azimuthDeg.toFixed(1) + '°'
  els.infoAltitude.textContent = altitudeDeg.toFixed(1) + '°'
  els.infoPhase.textContent = phaseIcon + ' ' + phaseLabel

  if (!isVisible) {
    els.belowHorizonMsg.classList.remove('hidden')
    const nextRise = getNextMoonrise(localNoon, latitude, longitude)
    if (nextRise) {
      els.belowHorizonMsg.textContent = '🌑 달이 지평선 아래에 있습니다. 다음 월출: ' + fmtTime(nextRise)
    }
  } else {
    els.belowHorizonMsg.classList.add('hidden')
  }

  // 타임존 약어 (예: GMT+9, KST)
  const tzAbbr = (() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(now).find(p => p.type === 'timeZoneName')?.value || ''
    } catch { return '' }
  })()
  document.getElementById('times-tz-label').textContent = tzAbbr ? `(${tzAbbr})` : ''

  // 월출/월몰: 오늘 + 내일 계산 후 now 이후 첫 이벤트 표시
  const todayTimes = getMoonTimes(localNoon, latitude, longitude)
  const tomorrowTimes = getMoonTimes(tomorrowNoon, latitude, longitude)

  const nextRise = (todayTimes.rise && todayTimes.rise > now ? todayTimes.rise : null)
    || (tomorrowTimes.rise || null)
  const nextSet = (todayTimes.set && todayTimes.set > now ? todayTimes.set : null)
    || (tomorrowTimes.set || null)

  // 날짜가 오늘인지 확인해서 날짜 포함 여부 결정
  const fmtEvent = d => {
    if (!d) return '—'
    const dLocal = makeLocalNoon(d, tz)
    const sameDay = dLocal.getTime() === localNoon.getTime()
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
      + (sameDay ? '' : ' (' + d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', timeZone: tz }) + ')')
  }

  document.getElementById('moonrise-label').textContent = '🌅 다음 월출'
  document.getElementById('moonset-label').textContent = '🌇 다음 월몰'
  els.infoMoonrise.textContent = fmtEvent(nextRise)
  els.infoMoonset.textContent = fmtEvent(nextSet)

  // 달까지의 거리
  const dist = getMoonDistanceData(now, latitude, longitude)
  els.infoDistance.textContent = dist.distance.toLocaleString('ko-KR') + ' km'
  const diffSign = dist.closerThanAvg ? '▼ ' : '▲ '
  els.infoDistanceDiff.textContent = diffSign + dist.percentDiff + '%'
  els.infoDistanceDiff.style.color = dist.closerThanAvg ? '#f5d87a' : '#8888aa'
  els.supermoonBadge.classList.toggle('hidden', !dist.isSuperMoon)
  els.minimoonBadge.classList.toggle('hidden', !dist.isMiniMoon)

  // 오늘의 조도
  const illumPct = (moonData.illumination * 100).toFixed(0)
  els.infoIllum.textContent = illumPct + '% — ' + moonData.phaseLabel
  const illumBar = document.getElementById('illum-bar')
  if (illumBar) illumBar.style.width = illumPct + '%'
  renderTodayWeather(tz)

  // 오늘의 달 궤적
  const altitudes = getDayAltitudes(localNoon, latitude, longitude)
  const localHour = (() => {
    try {
      const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now)
      const n = parseInt(h, 10)
      return n === 24 ? 0 : n
    } catch { return now.getHours() }
  })()
  renderTrajectory(els.trajectoryContainer, altitudes, localHour)

  // 다음 보름달 D-day
  const nextFull = getNextFullMoon(now)
  if (nextFull) {
    const dateStr = nextFull.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: tz })
    els.infoFullmoon.textContent = nextFull.daysLeft === 0 ? '오늘!' : `D-${nextFull.daysLeft} (${dateStr})`
  }

  // 이번 달 위상 달력 — 로컬 날짜 기준
  const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [localYear, localMonth, localDay] = localDateStr.split('-').map(Number)
  const phases = getMonthPhases(localYear, localMonth - 1)
  renderPhaseCalendar(els.phaseCalendar, phases, localDay)

  // 달 사진 추천일
  renderPhotoDaysForCurrentType()

  els.infoCoords.textContent = latitude.toFixed(4) + '°N ' + longitude.toFixed(4) + '°E ±' + accuracy.toFixed(0) + 'm'
  els.updateTime.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
}

function getPhotoDescription(day, type, fmtTime) {
  const illumPct = (day.illumination * 100).toFixed(0)
  const moonriseStr = day.moonrise ? fmtTime(day.moonrise) : null

  let base = ''

  if (type === 'surface') {
    if (day.score >= 85) {
      base = `조도 ${illumPct}%로 달 표면 촬영에 최적입니다. 터미네이터(명암 경계)가 선명해 크레이터와 산맥 그림자가 잘 나타납니다. 망원렌즈나 망원경 촬영에 적합합니다.`
    } else if (day.score >= 60) {
      base = `조도 ${illumPct}%로 달 표면 디테일을 촬영할 수 있습니다. 크레이터 일부를 확인할 수 있습니다.`
    } else {
      base = `조도 ${illumPct}%로 표면 디테일 촬영에는 적합하지 않습니다. 상현달·하현달에 가까운 날을 선택하세요.`
    }
  } else if (type === 'full') {
    if (day.score >= 90) {
      const sup = day.tags.includes('슈퍼문') ? ' 슈퍼문으로 평소보다 크게 보입니다.' : ''
      base = `조도 ${illumPct}%의 보름달입니다. 달 전체가 밝게 빛나 광각~표준 렌즈로 촬영하기 좋습니다.${sup}`
    } else if (day.score >= 60) {
      base = `조도 ${illumPct}%로 거의 보름달에 가깝습니다. 둥근 달의 모습을 촬영할 수 있습니다.`
    } else {
      base = `조도 ${illumPct}%로 보름달까지 아직 시간이 있습니다. 더 밝은 날을 선택하세요.`
    }
  } else if (type === 'landscape') {
    if (day.score >= 80 && moonriseStr) {
      base = `${moonriseStr}에 달이 떠오릅니다. 달 고도가 낮아 건물, 산, 나무와 함께 대형 달 풍경 사진을 촬영하기 매우 좋습니다.`
    } else if (day.score >= 60) {
      const timeHint = moonriseStr ? ` 월출 시간은 ${moonriseStr}입니다.` : ''
      base = `조도 ${illumPct}%의 달과 풍경을 함께 담을 수 있는 날입니다.${timeHint}`
    } else {
      base = `위상과 월출 조건이 달 풍경 촬영에 최적이 아닙니다. 더 높은 점수의 날을 선택하세요.`
    }
  }

  // 날씨 코멘트 추가
  if (day.cloudCover !== null && day.cloudCover !== undefined) {
    if (day.cloudCover >= 70) {
      base += ' 구름이 많아 촬영이 어려울 수 있습니다.'
    } else if (day.cloudCover < 25) {
      base += ' 맑은 날씨로 촬영 조건이 매우 좋습니다.'
    }
  }

  return base
}

function renderTodayWeather(tz) {
  const el = els.infoTodayWeather
  if (!el) return
  if (state.weatherLoading) { el.textContent = '불러오는 중...'; return }
  if (!state.weatherData) { el.textContent = '—'; return }
  const now = new Date()
  const localNoon = makeLocalNoon(now, tz || state.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const cloudCover = getNightCloudCover(state.weatherData, localNoon)
  if (cloudCover === null) { el.textContent = '예보 없음'; return }
  const info = getWeatherInfo(cloudCover)
  el.textContent = `${info.icon} ${info.label} (운량 ${cloudCover}%)`
}

function renderPhotoDaysForCurrentType() {
  if (!state.position) return
  const { latitude, longitude } = state.position
  const now = new Date()
  const tz = state.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const localNoon = makeLocalNoon(now, tz)
  const fmtTime = makeFmt(tz)

  // 날씨 로딩 인디케이터
  const loadingEl = document.getElementById('weather-loading')
  if (loadingEl) loadingEl.classList.toggle('hidden', !state.weatherLoading)

  let days = getPhotographyRecommendations(localNoon, latitude, longitude, state.photoType, 30)

  // 날씨 데이터가 있으면 천문(60%) + 날씨(40%) 블렌딩
  if (state.weatherData) {
    days = days.map(d => {
      const cloudCover = getNightCloudCover(state.weatherData, d.date)
      const weatherInfo = getWeatherInfo(cloudCover)
      if (cloudCover === null) {
        // 날씨 데이터 있지만 해당 날짜 예보 없음 (14일 초과)
        return { ...d, cloudCover: null, weatherInfo: null, noForecast: true }
      }
      const blended = Math.round(d.score * 0.6 + weatherInfo.score * 0.4)
      const stars = blended >= 85 ? 5 : blended >= 70 ? 4 : blended >= 55 ? 3 : blended >= 40 ? 2 : 1
      return { ...d, score: blended, cloudCover, weatherInfo, stars }
    }).sort((a, b) => b.score - a.score)
  }

  renderPhotoDays(document.getElementById('photo-days'), days, state.photoType, tz, fmtTime)
}

function renderPhotoDays(containerEl, days, type, tz, fmtTime) {
  containerEl.innerHTML = ''
  if (!days.length) {
    containerEl.textContent = '향후 30일 내 추천일 없음'
    return
  }
  const list = document.createElement('div')
  list.className = 'photo-day-list'

  const starColors = ['#f5d87a', '#c0c0c0', '#cd7f32', '#8888aa', '#8888aa']

  days.forEach((d, idx) => {
    const item = document.createElement('div')
    item.className = `photo-day-item rank-${idx + 1}`

    const starsEl = document.createElement('div')
    starsEl.className = 'photo-day-stars'
    starsEl.textContent = '★'.repeat(d.stars) + '☆'.repeat(5 - d.stars)
    starsEl.style.color = starColors[idx] || '#8888aa'

    const info = document.createElement('div')
    info.className = 'photo-day-info'

    const dateEl = document.createElement('div')
    dateEl.className = 'photo-day-date'
    dateEl.textContent = d.date.toLocaleDateString('ko-KR', {
      timeZone: tz, month: 'long', day: 'numeric', weekday: 'short'
    })

    const tagsEl = document.createElement('div')
    tagsEl.className = 'photo-day-tags'
    d.tags.forEach(tag => {
      const span = document.createElement('span')
      span.className = 'photo-tag' +
        (tag.includes('골든') || tag.includes('일몰') || tag.includes('일출') ? ' tag-golden' : '') +
        (tag === '슈퍼문' ? ' tag-super' : '') +
        (tag === '미니문' ? ' tag-mini' : '')
      span.textContent = tag
      tagsEl.appendChild(span)
    })
    if (d.noForecast) {
      const noForecastSpan = document.createElement('span')
      noForecastSpan.className = 'photo-tag tag-weather-none'
      noForecastSpan.textContent = '예보 없음'
      tagsEl.appendChild(noForecastSpan)
    } else if (d.weatherInfo) {
      const wSpan = document.createElement('span')
      wSpan.className = `photo-tag ${d.weatherInfo.tagClass}`
      wSpan.textContent = `${d.weatherInfo.icon} ${d.weatherInfo.label}`
      tagsEl.appendChild(wSpan)
    }

    const descEl = document.createElement('div')
    descEl.className = 'photo-day-desc'
    descEl.textContent = getPhotoDescription(d, type, fmtTime)

    const metaEl = document.createElement('div')
    metaEl.className = 'photo-day-meta'
    const illumPct = (d.illumination * 100).toFixed(0)
    const metaParts = [`조도 ${illumPct}%`]
    if (type === 'landscape') {
      if (d.moonrise) metaParts.push(`월출 ${fmtTime(d.moonrise)}`)
      if (d.sunset) metaParts.push(`일몰 ${fmtTime(d.sunset)}`)
    } else {
      metaParts.push(`거리 ${d.distance.toLocaleString('ko-KR')}km`)
      if (d.moonrise) metaParts.push(`월출 ${fmtTime(d.moonrise)}`)
    }
    if (d.cloudCover !== null && d.cloudCover !== undefined) {
      metaParts.push(`운량 ${d.cloudCover}%`)
    }
    metaEl.textContent = metaParts.join(' · ')

    info.appendChild(dateEl)
    info.appendChild(tagsEl)
    info.appendChild(descEl)
    info.appendChild(metaEl)
    item.appendChild(starsEl)
    item.appendChild(info)
    list.appendChild(item)
  })

  containerEl.appendChild(list)
}

function renderPhaseCalendar(containerEl, phases, today) {
  containerEl.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'phase-grid'
  for (const { day, icon } of phases) {
    const cell = document.createElement('div')
    cell.className = 'phase-cell' + (day === today ? ' phase-cell-today' : '')
    const dayEl = document.createElement('span')
    dayEl.className = 'phase-day'
    dayEl.textContent = day
    const iconEl = document.createElement('span')
    iconEl.className = 'phase-icon'
    iconEl.textContent = icon
    cell.appendChild(dayEl)
    cell.appendChild(iconEl)
    grid.appendChild(cell)
  }
  containerEl.appendChild(grid)
}

function setupOrientationUI() {
  const support = getOrientationSupport()

  if (support === 'needs-permission') {
    els.compassPermissionBtn.classList.remove('hidden')

    let activated = false
    const activateCompass = async () => {
      if (activated) return
      activated = true
      document.removeEventListener('touchstart', onFirstTouch)
      const result = await requestOrientationPermission()
      if (result === 'granted') {
        startWatchingHeading(heading => {
          state.deviceHeading = heading
          if (state.moonData) {
            updateCompass({
              moonAzimuth: state.moonData.azimuthDeg,
              moonAltitude: state.moonData.altitudeDeg,
              deviceHeading: state.deviceHeading,
            })
          }
        })
        els.compassPermissionBtn.classList.add('hidden')
      } else {
        activated = false // 거부 시 재시도 허용
      }
    }

    // 버튼 직접 클릭
    els.compassPermissionBtn.addEventListener('click', activateCompass)

    // 메인 화면 표시 후 첫 터치 시 자동 실행 (강제 적용)
    function onFirstTouch() {
      if (els.mainScreen.classList.contains('hidden')) return
      document.removeEventListener('touchstart', onFirstTouch)
      activateCompass()
    }
    document.addEventListener('touchstart', onFirstTouch, { passive: true })

  } else if (support === 'available') {
    startWatchingHeading(heading => {
      state.deviceHeading = heading
      if (state.moonData) {
        updateCompass({
          moonAzimuth: state.moonData.azimuthDeg,
          moonAltitude: state.moonData.altitudeDeg,
          deviceHeading: state.deviceHeading,
        })
      }
    })
  }
}

async function init() {
  showScreen('loading')
  setupOrientationUI()

  document.querySelectorAll('.photo-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.photo-type-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.photoType = btn.dataset.type
      renderPhotoDaysForCurrentType()
    })
  })

  try {
    state.position = await getCurrentPosition()
  } catch (e) {
    showError(e.message)
    return
  }

  // GPS 좌표 기반 타임존 조회 (실패해도 진행)
  state.timezone = await fetchTimezone(state.position.latitude, state.position.longitude)

  // 날씨 예보 백그라운드 로딩 (완료 시 추천일 자동 갱신)
  state.weatherLoading = true
  fetchWeatherForecast(state.position.latitude, state.position.longitude).then(data => {
    state.weatherLoading = false
    state.weatherData = data || null
    renderPhotoDaysForCurrentType()
    renderTodayWeather()
  })

  const verEl = document.getElementById('app-version')
  if (verEl) verEl.textContent = `Lunar v${APP_VERSION}`

  initCompass(els.compassContainer)
  await updateMoonDisplay()
  showScreen('main')

  state.updateTimer = setInterval(updateMoonDisplay, 60_000)
  state.watchId = watchPosition(pos => { state.position = pos; updateMoonDisplay() }, () => {})
}

els.manualForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const lat = parseFloat(els.inputLat.value)
  const lon = parseFloat(els.inputLon.value)

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    alert('올바른 좌표를 입력해 주세요.')
    return
  }

  state.position = { latitude: lat, longitude: lon, accuracy: 0 }
  state.timezone = await fetchTimezone(lat, lon)

  state.weatherLoading = true
  state.weatherData = null
  fetchWeatherForecast(lat, lon).then(data => {
    state.weatherLoading = false
    state.weatherData = data || null
    renderPhotoDaysForCurrentType()
    renderTodayWeather()
  })

  initCompass(els.compassContainer)
  await updateMoonDisplay()
  showScreen('main')

  if (state.updateTimer) clearInterval(state.updateTimer)
  state.updateTimer = setInterval(updateMoonDisplay, 60_000)
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
