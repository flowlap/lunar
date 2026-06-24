import { getCurrentPosition, watchPosition } from './location.js'
import { getMoonData, getNextMoonrise, getMoonTimes, getMoonDistanceData, getDayAltitudes, getMonthPhases, getNextFullMoon } from './moon.js'
import { initCompass, updateCompass, renderAltitude, renderTrajectory } from './compass.js'
import { getOrientationSupport, requestOrientationPermission, startWatchingHeading, stopWatchingHeading } from './orientation.js'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

const state = { position: null, moonData: null, deviceHeading: null, updateTimer: null, watchId: null }

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
  const displayMessage = messages[message] || message
  els.errorMessage.textContent = displayMessage
  showScreen('error')
}

async function updateMoonDisplay() {
  if (!state.position) return

  const { latitude, longitude, accuracy } = state.position
  const now = new Date()
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
    const nextRise = getNextMoonrise(now, latitude, longitude)
    if (nextRise) {
      const timeStr = nextRise.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      els.belowHorizonMsg.textContent = '🌑 달이 지평선 아래에 있습니다. 다음 월출: ' + timeStr
    }
  } else {
    els.belowHorizonMsg.classList.add('hidden')
  }

  // 월출 / 월몰
  const moonTimes = getMoonTimes(now, latitude, longitude)
  const fmt = d => d ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—'
  if (moonTimes.alwaysUp) {
    els.infoMoonrise.textContent = '종일 가시'
    els.infoMoonset.textContent = '종일 가시'
  } else if (moonTimes.alwaysDown) {
    els.infoMoonrise.textContent = '종일 불가'
    els.infoMoonset.textContent = '종일 불가'
  } else {
    els.infoMoonrise.textContent = fmt(moonTimes.rise)
    els.infoMoonset.textContent = fmt(moonTimes.set)
  }

  // 달까지의 거리
  const dist = getMoonDistanceData(now, latitude, longitude)
  els.infoDistance.textContent = dist.distance.toLocaleString('ko-KR') + ' km'
  const diffSign = dist.closerThanAvg ? '▼ ' : '▲ '
  const diffColor = dist.closerThanAvg ? '#f5d87a' : '#8888aa'
  els.infoDistanceDiff.textContent = diffSign + dist.percentDiff + '%'
  els.infoDistanceDiff.style.color = diffColor
  els.supermoonBadge.classList.toggle('hidden', !dist.isSuperMoon)
  els.minimoonBadge.classList.toggle('hidden', !dist.isMiniMoon)

  // 오늘의 달 궤적
  const altitudes = getDayAltitudes(now, latitude, longitude)
  renderTrajectory(els.trajectoryContainer, altitudes, now.getHours())

  // 다음 보름달 D-day
  const nextFull = getNextFullMoon(now)
  if (nextFull) {
    els.infoFullmoon.textContent = nextFull.daysLeft === 0
      ? '오늘!'
      : `D-${nextFull.daysLeft} (${nextFull.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })})`
  }

  // 이번 달 위상 달력
  const phases = getMonthPhases(now.getFullYear(), now.getMonth())
  renderPhaseCalendar(els.phaseCalendar, phases, now.getDate())

  els.infoCoords.textContent = latitude.toFixed(4) + '°N ' + longitude.toFixed(4) + '°E ±' + accuracy.toFixed(0) + 'm'
  els.updateTime.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
