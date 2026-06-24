import { getCurrentPosition, watchPosition } from './location.js'
import { getMoonData, getNextMoonrise } from './moon.js'
import { initCompass, updateCompass, renderAltitude } from './compass.js'
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
  const moonData = getMoonData(new Date(), latitude, longitude)
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
    const nextRise = getNextMoonrise(new Date(), latitude, longitude)
    if (nextRise) {
      const timeStr = nextRise.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      els.belowHorizonMsg.textContent = '달이 지평선 아래에 있습니다. 다음 월출: ' + timeStr
    }
  } else {
    els.belowHorizonMsg.classList.add('hidden')
  }

  els.infoCoords.textContent = latitude.toFixed(4) + '°N ' + longitude.toFixed(4) + '°E ±' + accuracy.toFixed(0) + 'm'
  els.updateTime.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
