/**
 * Compass orientation module
 * ES Module, no dependencies
 */

let handler = null;
let smoothedHeading = null;

const SMOOTHING_ALPHA = 0.2;

/**
 * Returns the orientation support status of the current device/browser.
 * @returns {'available' | 'needs-permission' | 'unavailable'}
 */
export function getOrientationSupport() {
  if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
    return 'unavailable';
  }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    return 'needs-permission';
  }
  return 'available';
}

/**
 * Requests permission to use device orientation (iOS 13+).
 * @returns {Promise<'granted' | 'denied' | 'unavailable'>}
 */
export async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent === 'undefined' ||
      typeof DeviceOrientationEvent.requestPermission !== 'function') {
    return 'unavailable';
  }
  try {
    const result = await DeviceOrientationEvent.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
}

/**
 * Applies exponential moving average smoothing to a heading value,
 * correctly handling the 0/360 degree boundary.
 * @param {number} current - Current smoothed heading (or null if first reading)
 * @param {number} newHeading - New raw heading in degrees [0, 360)
 * @returns {number} Smoothed heading in degrees [0, 360)
 */
function smoothHeading(current, newHeading) {
  if (current === null) {
    return newHeading;
  }

  let diff = newHeading - current;

  // Handle 0/360 boundary: choose the shortest arc
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }

  let result = current + SMOOTHING_ALPHA * diff;

  // Normalize to [0, 360)
  result = ((result % 360) + 360) % 360;

  return result;
}

/**
 * Starts watching the device compass heading.
 * @param {function(number): void} callback - Called with heading in degrees (0=North)
 */
export function startWatchingHeading(callback) {
  if (handler !== null) {
    stopWatchingHeading();
  }

  smoothedHeading = null;

  handler = (event) => {
    let rawHeading;

    if (typeof event.webkitCompassHeading === 'number' &&
        !isNaN(event.webkitCompassHeading)) {
      rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      rawHeading = (360 - event.alpha) % 360;
    } else {
      return;
    }

    smoothedHeading = smoothHeading(smoothedHeading, rawHeading);
    callback(smoothedHeading);
  };

  window.addEventListener('deviceorientation', handler, true);
}

/**
 * Stops watching the device compass heading and resets internal state.
 */
export function stopWatchingHeading() {
  if (handler !== null) {
    window.removeEventListener('deviceorientation', handler, true);
    handler = null;
  }
  smoothedHeading = null;
}
