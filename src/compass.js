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
