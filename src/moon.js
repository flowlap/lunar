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
