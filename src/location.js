/**
 * GPS 위치 모듈
 * navigator.geolocation API 래핑 유틸리티
 */

const GEOLOCATION_OPTIONS = {
  getCurrentPosition: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
  },
  watchPosition: {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000,
  },
};

/**
 * GeolocationPositionError 코드를 에러 메시지 문자열로 변환
 * @param {number} code - GeolocationPositionError.code
 * @returns {string} 에러 메시지
 */
function mapGeolocationErrorCode(code) {
  switch (code) {
    case 1:
      return 'PERMISSION_DENIED';
    case 2:
      return 'POSITION_UNAVAILABLE';
    case 3:
      return 'TIMEOUT';
    default:
      return 'POSITION_UNAVAILABLE';
  }
}

/**
 * 현재 GPS 위치를 한 번 가져옵니다.
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}>}
 * @throws {Error} PERMISSION_DENIED | POSITION_UNAVAILABLE | TIMEOUT | GEOLOCATION_NOT_SUPPORTED
 */
export async function getCurrentPosition() {
  if (!navigator.geolocation) {
    throw new Error('GEOLOCATION_NOT_SUPPORTED');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(new Error(mapGeolocationErrorCode(error.code)));
      },
      GEOLOCATION_OPTIONS.getCurrentPosition,
    );
  });
}

/**
 * GPS 위치를 지속적으로 감시합니다.
 * @param {function({latitude: number, longitude: number, accuracy: number}): void} onSuccess - 위치 업데이트 성공 콜백
 * @param {function(Error): void} [onError] - 에러 콜백
 * @returns {number} watchId
 * @throws {Error} GEOLOCATION_NOT_SUPPORTED
 */
export function watchPosition(onSuccess, onError) {
  if (!navigator.geolocation) {
    throw new Error('GEOLOCATION_NOT_SUPPORTED');
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onSuccess({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    (error) => {
      if (onError) {
        onError(new Error(mapGeolocationErrorCode(error.code)));
      }
    },
    GEOLOCATION_OPTIONS.watchPosition,
  );

  return watchId;
}

/**
 * GPS 위치 감시를 중지합니다.
 * @param {number} watchId - watchPosition이 반환한 watchId
 */
export function clearWatch(watchId) {
  navigator.geolocation.clearWatch(watchId);
}
