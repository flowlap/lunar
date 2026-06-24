// compass.js - 나침반 UI 모듈
// ES Module, DOM + SVG 조작만 사용, 의존성 없음

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSVGEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val);
  }
  return el;
}

export function initCompass(containerEl) {
  // 280x280 SVG 생성
  const svg = createSVGEl('svg', {
    id: 'compass-svg',
    width: '280',
    height: '280',
    viewBox: '0 0 280 280',
  });

  // a) 배경 원
  const bgCircle = createSVGEl('circle', {
    cx: '140',
    cy: '140',
    r: '130',
    fill: '#12122a',
    stroke: '#2a2a4a',
    'stroke-width': '1',
  });
  svg.appendChild(bgCircle);

  // b) compass-rose 그룹
  const roseGroup = createSVGEl('g', { id: 'compass-rose' });

  const directions = [
    { label: 'N',  angle: 0 },
    { label: 'NE', angle: 45 },
    { label: 'E',  angle: 90 },
    { label: 'SE', angle: 135 },
    { label: 'S',  angle: 180 },
    { label: 'SW', angle: 225 },
    { label: 'W',  angle: 270 },
    { label: 'NW', angle: 315 },
  ];

  // 매 10도 눈금선 (360/10 = 36개)
  for (let deg = 0; deg < 360; deg += 10) {
    const isCardinal = deg % 45 === 0;
    const rad = (deg - 90) * Math.PI / 180;
    const innerR = isCardinal ? 115 : 120;
    const outerR = 130;
    const x1 = 140 + outerR * Math.cos(rad);
    const y1 = 140 + outerR * Math.sin(rad);
    const x2 = 140 + innerR * Math.cos(rad);
    const y2 = 140 + innerR * Math.sin(rad);

    const line = createSVGEl('line', {
      x1: String(x1),
      y1: String(y1),
      x2: String(x2),
      y2: String(y2),
      stroke: '#4a4a6a',
      'stroke-width': isCardinal ? '2' : '1',
    });
    roseGroup.appendChild(line);
  }

  // 방위 레이블 (반지름 105 위치)
  for (const { label, angle } of directions) {
    const rad = (angle - 90) * Math.PI / 180;
    const x = 140 + 105 * Math.cos(rad);
    const y = 140 + 105 * Math.sin(rad);
    const fill = label === 'N' ? '#ff6b6b' : '#8888aa';

    const text = createSVGEl('text', {
      x: String(x),
      y: String(y),
      fill,
      'font-size': '14',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    text.textContent = label;
    roseGroup.appendChild(text);
  }

  svg.appendChild(roseGroup);

  // c) moon-arrow 그룹
  const arrowGroup = createSVGEl('g', { id: 'moon-arrow' });

  // 화살표 path
  const arrowPath = createSVGEl('path', {
    d: 'M 140 35 L 130 115 L 140 105 L 150 115 Z',
    fill: '#f5d87a',
  });
  arrowGroup.appendChild(arrowPath);

  // 달 아이콘 (화살표 끝)
  const moonCircle = createSVGEl('circle', {
    cx: '140',
    cy: '25',
    r: '8',
    fill: '#f5d87a',
  });
  arrowGroup.appendChild(moonCircle);

  svg.appendChild(arrowGroup);

  // d) 중심 원
  const centerCircle = createSVGEl('circle', {
    cx: '140',
    cy: '140',
    r: '5',
    fill: '#f5d87a',
  });
  svg.appendChild(centerCircle);

  containerEl.appendChild(svg);
}

export function updateCompass({ moonAzimuth, moonAltitude, deviceHeading }) {
  const roseEl = document.getElementById('compass-rose');
  const arrowEl = document.getElementById('moon-arrow');

  if (!roseEl || !arrowEl) return;

  // compass-rose 회전
  if (deviceHeading != null) {
    roseEl.setAttribute('transform', `rotate(${-deviceHeading}, 140, 140)`);
  } else {
    roseEl.setAttribute('transform', 'rotate(0)');
  }

  // moon-arrow 회전
  if (deviceHeading != null) {
    arrowEl.setAttribute('transform', `rotate(${moonAzimuth - deviceHeading}, 140, 140)`);
  } else {
    arrowEl.setAttribute('transform', `rotate(${moonAzimuth}, 140, 140)`);
  }

  // 달이 지평선 아래면 opacity 줄이기
  if (moonAltitude < 0) {
    arrowEl.setAttribute('opacity', '0.3');
  } else {
    arrowEl.setAttribute('opacity', '1');
  }
}

export function renderAltitude(containerEl, altitudeDeg) {
  // 기존 SVG 제거 후 재생성 (업데이트 시 중복 방지)
  const existing = document.getElementById('altitude-svg')
  if (existing) existing.remove()

  // 280x160 SVG 생성
  const svg = createSVGEl('svg', {
    id: 'altitude-svg',
    width: '280',
    height: '160',
    viewBox: '0 0 280 160',
  });

  // 지평선: 수평선 y=130
  const horizon = createSVGEl('line', {
    x1: '20',
    y1: '130',
    x2: '260',
    y2: '130',
    stroke: '#4fc3f7',
    'stroke-width': '1.5',
  });
  svg.appendChild(horizon);

  // 반원: cx=140, cy=130, r=100, 상단만 (반원 arc)
  const semicircle = createSVGEl('path', {
    d: 'M 40 130 A 100 100 0 0 1 240 130',
    fill: 'none',
    stroke: '#2a2a4a',
    'stroke-width': '1.5',
  });
  svg.appendChild(semicircle);

  // 각도 레이블: 0°, 30°, 60°, 90°
  const angleLabels = [0, 30, 60, 90];
  for (const deg of angleLabels) {
    const rad = (90 - deg) * Math.PI / 180;
    // 반원 위 레이블 위치 (반지름 115)
    const lx = 140 + 115 * Math.sin(rad);
    const ly = 130 - 115 * Math.cos(rad);

    const text = createSVGEl('text', {
      x: String(lx),
      y: String(ly),
      fill: '#8888aa',
      'font-size': '11',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    text.textContent = `${deg}°`;
    svg.appendChild(text);
  }

  // 달 위치 점 계산
  const clamped = Math.max(-90, Math.min(90, altitudeDeg));
  const angle = (90 - clamped) * Math.PI / 180;
  const px = 140 + 100 * Math.sin(angle);
  const py = 130 - 100 * Math.cos(angle);

  let moonFill, moonR, moonPy;
  if (clamped >= 0) {
    moonFill = '#f5d87a';
    moonR = 8;
    moonPy = py;
  } else {
    moonFill = '#444466';
    moonR = 6;
    // py > 130 (지평선 아래)
    moonPy = py;
  }

  const moonDot = createSVGEl('circle', {
    cx: String(px),
    cy: String(moonPy),
    r: String(moonR),
    fill: moonFill,
  });
  svg.appendChild(moonDot);

  containerEl.appendChild(svg);
}

export function renderTrajectory(containerEl, altitudes, currentHour) {
  const existing = document.getElementById('trajectory-svg')
  if (existing) existing.remove()

  const W = 280, H = 130
  const svg = createSVGEl('svg', { id: 'trajectory-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` })

  const padL = 26, padR = 8, padT = 8, padB = 22
  const gW = W - padL - padR
  const gH = H - padT - padB
  const maxAlt = 90, minAlt = -20

  const toX = h => padL + (h / 23) * gW
  const toY = a => padT + gH - ((Math.max(minAlt, Math.min(maxAlt, a)) - minAlt) / (maxAlt - minAlt)) * gH
  const hy = toY(0)

  for (const deg of [30, 60, 90]) {
    const y = toY(deg)
    svg.appendChild(createSVGEl('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#1e1e3a', 'stroke-width': '1' }))
    const t = createSVGEl('text', { x: padL - 3, y: y + 3, fill: '#8888aa', 'font-size': '8', 'text-anchor': 'end' })
    t.textContent = `${deg}°`
    svg.appendChild(t)
  }

  svg.appendChild(createSVGEl('line', { x1: padL, y1: hy, x2: W - padR, y2: hy, stroke: '#4fc3f7', 'stroke-width': '1', 'stroke-dasharray': '4,3' }))
  const hzLabel = createSVGEl('text', { x: padL - 3, y: hy + 3, fill: '#4fc3f7', 'font-size': '8', 'text-anchor': 'end' })
  hzLabel.textContent = '0°'
  svg.appendChild(hzLabel)

  for (const h of [0, 6, 12, 18, 23]) {
    const label = createSVGEl('text', { x: toX(h), y: H - 5, fill: '#8888aa', 'font-size': '8', 'text-anchor': 'middle' })
    label.textContent = h === 23 ? '24시' : `${h}시`
    svg.appendChild(label)
  }

  let fillD = `M ${toX(0)} ${hy}`
  for (let i = 0; i < 24; i++) fillD += ` L ${toX(i)} ${altitudes[i] > 0 ? toY(altitudes[i]) : hy}`
  fillD += ` L ${toX(23)} ${hy} Z`
  svg.appendChild(createSVGEl('path', { d: fillD, fill: '#f5d87a', opacity: '0.12' }))

  let fullD = `M ${toX(0)} ${toY(altitudes[0])}`
  for (let i = 1; i < 24; i++) fullD += ` L ${toX(i)} ${toY(altitudes[i])}`
  svg.appendChild(createSVGEl('path', { d: fullD, fill: 'none', stroke: '#333355', 'stroke-width': '1.5' }))

  let seg = null
  for (let i = 0; i < 24; i++) {
    if (altitudes[i] > 0) {
      seg = seg === null ? `M ${toX(i)} ${toY(altitudes[i])}` : seg + ` L ${toX(i)} ${toY(altitudes[i])}`
    } else if (seg) {
      svg.appendChild(createSVGEl('path', { d: seg, fill: 'none', stroke: '#f5d87a', 'stroke-width': '2' }))
      seg = null
    }
  }
  if (seg) svg.appendChild(createSVGEl('path', { d: seg, fill: 'none', stroke: '#f5d87a', 'stroke-width': '2' }))

  if (currentHour >= 0 && currentHour < 24) {
    const cx = toX(currentHour)
    svg.appendChild(createSVGEl('line', { x1: cx, y1: padT, x2: cx, y2: H - padB, stroke: '#ff6b6b', 'stroke-width': '1', 'stroke-dasharray': '3,3' }))
    const curAlt = altitudes[currentHour]
    svg.appendChild(createSVGEl('circle', { cx, cy: toY(curAlt), r: '4', fill: curAlt > 0 ? '#f5d87a' : '#444466', stroke: '#ff6b6b', 'stroke-width': '1.5' }))
  }

  containerEl.appendChild(svg)
}
