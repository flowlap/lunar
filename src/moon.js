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

export function getPhotographyDays(localNoon, lat, lon, days = 30) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')

  const results = []

  for (let i = 0; i < days; i++) {
    const noon = new Date(localNoon.getTime() + i * 86400000)
    const illum = SunCalc.getMoonIllumination(noon)
    const moonPos = SunCalc.getMoonPosition(noon, lat, lon)
    const moonT = SunCalc.getMoonTimes(noon, lat, lon)
    const sunT = SunCalc.getTimes(noon, lat, lon)
    const phase = illum.phase
    const dist = moonPos.distance

    // 위상 점수: 보름달(0.5) 중심으로 ±0.1 범위 최고점
    const phaseDist = Math.abs(phase - 0.5)
    const phaseScore = phaseDist < 0.03 ? 100
      : phaseDist < 0.07 ? 85
      : phaseDist < 0.12 ? 60
      : phaseDist < 0.18 ? 30
      : 0

    // 거리 점수: 가까울수록 높음
    const distScore = dist < 359000 ? 100
      : dist < 363000 ? 90
      : dist < 370000 ? 75
      : dist < 380000 ? 55
      : dist < 390000 ? 40
      : 25

    // 골든아워 점수: 월출-일몰 시간 차이 (분)
    let goldenScore = 0
    if (moonT.rise && sunT.sunset) {
      const diffMin = Math.abs(moonT.rise - sunT.sunset) / 60000
      goldenScore = diffMin < 15 ? 100
        : diffMin < 30 ? 90
        : diffMin < 60 ? 70
        : diffMin < 90 ? 50
        : diffMin < 120 ? 30
        : 0
    }
    if (moonT.set && sunT.sunrise) {
      const diffMin = Math.abs(moonT.set - sunT.sunrise) / 60000
      const setScore = diffMin < 15 ? 90
        : diffMin < 30 ? 75
        : diffMin < 60 ? 55
        : diffMin < 90 ? 35
        : 0
      goldenScore = Math.max(goldenScore, setScore)
    }

    const totalScore = phaseScore * 0.5 + distScore * 0.15 + goldenScore * 0.35

    if (totalScore < 20) continue

    const tags = []
    if (phaseDist < 0.03) tags.push('보름달')
    else if (phaseDist < 0.07) tags.push('거의 보름달')
    else if (phaseDist < 0.12) tags.push('대형 달')
    if (dist < 363000) tags.push('슈퍼문')
    else if (dist < 370000) tags.push('달이 가까움')
    if (goldenScore >= 90) tags.push('월출=일몰')
    else if (goldenScore >= 70) tags.push('골든아워')
    else if (goldenScore >= 50) tags.push('일몰 근접')

    const stars = totalScore >= 80 ? 3 : totalScore >= 55 ? 2 : 1

    results.push({
      date: noon,
      totalScore,
      phase,
      distance: Math.round(dist),
      illumination: illum.fraction,
      moonrise: moonT.rise || null,
      sunset: sunT.sunset || null,
      tags,
      stars,
    })
  }

  return results.sort((a, b) => b.totalScore - a.totalScore).slice(0, 5)
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
