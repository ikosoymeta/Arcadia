/**
 * Detect the user's operating system for platform-specific instructions.
 * Uses navigator.userAgentData (modern) with navigator.platform fallback.
 */
export function detectPlatform(): 'mac' | 'windows' {
  try {
    // Modern API (Chromium 93+)
    const uaData = (navigator as any).userAgentData;
    if (uaData?.platform) {
      const p = uaData.platform.toLowerCase();
      if (p === 'windows') return 'windows';
      return 'mac'; // macOS, Linux, ChromeOS → all use unix-style commands
    }

    // Fallback: navigator.platform (deprecated but widely supported)
    const platform = navigator.platform?.toLowerCase() || '';
    if (platform.includes('win')) return 'windows';

    // Fallback: userAgent string
    const ua = navigator.userAgent?.toLowerCase() || '';
    if (ua.includes('windows')) return 'windows';
  } catch {
    // SSR or restricted environment
  }
  return 'mac'; // default to mac/linux (unix commands)
}
