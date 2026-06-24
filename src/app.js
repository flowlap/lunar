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

  // 로컬 정오 기준 날짜 — UTC 날짜 경계 문제 방지
  const localNoon = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(now)
      .replace(/(\d+)-(\d+)-(\d+)/, '$1-$2-$3') + 'T12:00:00'
  )

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

  // 월출 / 월몰 — 로컬 정오 기준 날짜로 계산
  const moonTimes = getMoonTimes(localNoon, latitude, longitude)
  if (moonTimes.alwaysUp) {
    els.infoMoonrise.textContent = '종일 가시'
    els.infoMoonset.textContent = '종일 가시'
  } else if (moonTimes.alwaysDown) {
    els.infoMoonrise.textContent = '종일 불가'
    els.infoMoonset.textContent = '종일 불가'
  } else {
    els.infoMoonrise.textContent = fmtTime(moonTimes.rise)
    els.infoMoonset.textContent = fmtTime(moonTimes.set)
  }

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
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now),
    10
  )
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
