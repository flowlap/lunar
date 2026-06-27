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

export function getPhotographyRecommendations(localNoon, lat, lon, type = 'full', days = 30) {
  if (!window.SunCalc) throw new Error('SunCalc not loaded')
  const results = []

  for (let i = 0; i < days; i++) {
    const noon = new Date(localNoon.getTime() + i * 86400000)
    const illum = SunCalc.getMoonIllumination(noon)
    const moonPos = SunCalc.getMoonPosition(noon, lat, lon)
    const moonT = SunCalc.getMoonTimes(noon, lat, lon)
    const sunT = SunCalc.getTimes(noon, lat, lon)

    const illumPct = illum.fraction * 100
    const phase = illum.phase
    const dist = Math.round(moonPos.distance)

    let score = 0
    const tags = []

    if (type === 'surface') {
      // 터미네이터(명암 경계)가 가장 선명한 위상 우선
      if (illumPct >= 45 && illumPct <= 55) {
        score = 100
        tags.push(phase < 0.5 ? '상현달' : '하현달')
      } else if (illumPct >= 20 && illumPct < 45) {
        score = 90
        tags.push('초승달')
      } else if (illumPct > 55 && illumPct <= 70) {
        score = 85
        tags.push('볼록달')
      } else if (illumPct > 70 && illumPct <= 90) {
        score = 60
        tags.push('볼록달')
      } else {
        score = illumPct > 90 ? 30 : 10
        tags.push(illumPct > 90 ? '보름달' : '그믐달')
      }
      if (score < 30) continue

    } else if (type === 'full') {
      // 조도 95%+ 최고점
      if (illumPct >= 95) {
        score = 100
        tags.push('보름달')
      } else if (illumPct >= 90) {
        score = 80
        tags.push('거의 보름달')
      } else if (illumPct >= 80) {
        score = 60
        tags.push('볼록달')
      } else {
        score = 30
      }
      if (dist < 370000) tags.push('달이 가까움')
      if (score < 30) continue

    } else if (type === 'landscape') {
      // 보름달 ±3일 기준 위상 보너스
      const phaseDist = Math.abs(phase - 0.5)
      if (phaseDist < 0.04) { score += 60; tags.push('보름달') }
      else if (phaseDist < 0.1) { score += 40; tags.push('거의 보름달') }
      else if (phaseDist < 0.15) { score += 20 }

      // 월출≈일몰 (저녁 골든아워)
      if (moonT.rise && sunT.sunset) {
        const diffMin = Math.abs(moonT.rise - sunT.sunset) / 60000
        if (diffMin < 60) { score += 20; tags.push('월출≈일몰') }
      }
      // 월몰≈일출 (새벽 골든아워), 위 조건 미충족 시
      if (moonT.set && sunT.sunrise && !tags.some(t => t.includes('월출'))) {
        const diffMin = Math.abs(moonT.set - sunT.sunrise) / 60000
        if (diffMin < 60) { score += 20; tags.push('월몰≈일출') }
      }

      // 일몰/일출 시 달 고도 0~10° (저고도 풍경 구도)
      if (sunT.sunset) {
        const pos = SunCalc.getMoonPosition(sunT.sunset, lat, lon)
        const alt = pos.altitude * 180 / Math.PI
        if (alt >= 0 && alt <= 10) score += 20
      } else if (sunT.sunrise) {
        const pos = SunCalc.getMoonPosition(sunT.sunrise, lat, lon)
        const alt = pos.altitude * 180 / Math.PI
        if (alt >= 0 && alt <= 10) score += 20
      }

      if (score < 20) continue
    }

    // 모든 타입 공통: 슈퍼문 / 미니문 태그
    if (dist < 363000) tags.push('슈퍼문')
    else if (dist > 404000) tags.push('미니문')

    const stars = score >= 85 ? 5 : score >= 70 ? 4 : score >= 55 ? 3 : score >= 40 ? 2 : 1

    results.push({
      date: noon,
      score,
      stars,
      phase,
      distance: dist,
      illumination: illum.fraction,
      moonrise: moonT.rise || null,
      moonset: moonT.set || null,
      sunrise: sunT.sunrise || null,
      sunset: sunT.sunset || null,
      tags,
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5)
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
