import { getCurrentPosition, watchPosition } from './location.js'
import { getMoonData, getNextMoonrise, getMoonTimes, getMoonDistanceData, getDayAltitudes, getMonthPhases, getNextFullMoon } from './moon.js'
import { initCompass, updateCompass, renderAltitude, renderTrajectory } from './compass.js'
import { getOrientationSupport, requestOrientationPermission, startWatchingHeading, stopWatchingHeading } from './orientation.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

const state = {
  position: null,
  moonData: null,
  deviceHeading: null,
  updateTimer: null,
  watchId: null,
  timezone: null,
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

  els.infoCoords.textContent = latitude.toFixed(4) + '°N ' + longitude.toFixed(4) + '°E ±' + accuracy.toFixed(0) + 'm'
  els.updateTime.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
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
    els.compassPermissionBtn.addEventListener('click', async () => {
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
      }
    })
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

  try {
    state.position = await getCurrentPosition()
  } catch (e) {
    showError(e.message)
    return
  }

  // GPS 좌표 기반 타임존 조회 (실패해도 진행)
  state.timezone = await fetchTimezone(state.position.latitude, state.position.longitude)

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
