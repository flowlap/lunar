export function getMoonData(date, lat, lon) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded');

  const pos = window.SunCalc.getMoonPosition(date, lat, lon);
  const illum = window.SunCalc.getMoonIllumination(date);

  const azimuthDeg = ((pos.azimuth * 180 / Math.PI) + 180 + 360) % 360;
  const altitudeDeg = pos.altitude * 180 / Math.PI;

  const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const directionLabel = directions[Math.round(azimuthDeg / 45) % 8];

  const phase = illum.phase;

  let phaseLabel;
  let phaseIcon;

  if (phase < 0.03 || phase >= 0.97) {
    phaseLabel = '삭 (그믐달)';
    phaseIcon = '🌑';
  } else if (phase < 0.22) {
    phaseLabel = '초승달';
    phaseIcon = '🌒';
  } else if (phase < 0.28) {
    phaseLabel = '상현달';
    phaseIcon = '🌓';
  } else if (phase < 0.47) {
    phaseLabel = '상현 보름 사이';
    phaseIcon = '🌔';
  } else if (phase < 0.53) {
    phaseLabel = '보름달';
    phaseIcon = '🌕';
  } else if (phase < 0.72) {
    phaseLabel = '보름 하현 사이';
    phaseIcon = '🌖';
  } else if (phase < 0.78) {
    phaseLabel = '하현달';
    phaseIcon = '🌗';
  } else {
    phaseLabel = '그믐달';
    phaseIcon = '🌘';
  }

  return {
    azimuth: pos.azimuth,
    altitude: pos.altitude,
    azimuthDeg,
    altitudeDeg,
    directionLabel,
    phase,
    phaseLabel,
    phaseIcon,
    illumination: illum.fraction,
    isVisible: altitudeDeg > 0,
  };
}

function getPhaseInfo(phase) {
  if (phase < 0.03 || phase >= 0.97) return { label: '삭 (그믐달)', icon: '🌑' }
  if (phase < 0.22) return { label: '초승달', icon: '🌒' }
  if (phase < 0.28) return { label: '상현달', icon: '🌓' }
  if (phase < 0.47) return { label: '상현 보름 사이', icon: '🌔' }
  if (phase < 0.53) return { label: '보름달', icon: '🌕' }
  if (phase < 0.72) return { label: '보름 하현 사이', icon: '🌖' }
  if (phase < 0.78) return { label: '하현달', icon: '🌗' }
  return { label: '그믐달', icon: '🌘' }
}

export function getMoonTimes(date, lat, lon) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  const t = SunCalc.getMoonTimes(date, lat, lon)
  return {
    rise: t.rise || null,
    set: t.set || null,
    alwaysUp: t.alwaysUp || false,
    alwaysDown: t.alwaysDown || false,
  }
}

export function getMoonDistanceData(date, lat, lon) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  const pos = SunCalc.getMoonPosition(date, lat, lon)
  const distance = Math.round(pos.distance)
  const AVG = 384400
  return {
    distance,
    isSuperMoon: distance < 363000,
    isMiniMoon: distance > 404000,
    closerThanAvg: distance < AVG,
    percentDiff: (Math.abs(distance - AVG) / AVG * 100).toFixed(1),
  }
}

export function getDayAltitudes(date, lat, lon) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  const altitudes = []
  for (let hour = 0; hour < 24; hour++) {
    const d = new Date(date)
    d.setHours(hour, 0, 0, 0)
    const pos = SunCalc.getMoonPosition(d, lat, lon)
    altitudes.push(pos.altitude * 180 / Math.PI)
  }
  return altitudes
}

export function getMonthPhases(year, month) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const result = []
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day, 12, 0, 0)
    const illum = SunCalc.getMoonIllumination(d)
    result.push({ day, phase: illum.phase, icon: getPhaseInfo(illum.phase).icon })
  }
  return result
}

export function getNextFullMoon(fromDate) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  let prev = SunCalc.getMoonIllumination(fromDate).phase
  let passedNewMoon = prev < 0.5

  for (let i = 1; i <= 140; i++) {
    const t = new Date(fromDate.getTime() + i * 6 * 3600000)
    const curr = SunCalc.getMoonIllumination(t).phase
    if (prev > 0.9 && curr < 0.1) passedNewMoon = true
    if (passedNewMoon && prev < 0.5 && curr >= 0.5) {
      return { date: t, daysLeft: Math.max(0, Math.round((t - fromDate) / 86400000)) }
    }
    prev = curr
  }
  return null
}

export function getNextMoonrise(date, lat, lon) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded');

  const times = window.SunCalc.getMoonTimes(date, lat, lon);
  if (times.rise && times.rise > date) {
    return times.rise;
  }

  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowTimes = window.SunCalc.getMoonTimes(tomorrow, lat, lon);
  return tomorrowTimes.rise || null;
}
