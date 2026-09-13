const isLocalAddress = (url) => {
  if (!url) return true;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url);
};

const getAppBaseUrl = (req = null) => {
  const configured = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.CLIENT_URL || '').trim().replace(/\/$/, '');

  // 1. Explicit valid public URL in env
  if (configured && !isLocalAddress(configured)) {
    return configured;
  }

  // 2. Derive from incoming request headers (Origin / Referer / Host)
  if (req) {
    const origin = req.headers?.origin || req.headers?.referer;
    if (origin) {
      try {
        const parsed = new URL(origin);
        const originUrl = `${parsed.protocol}//${parsed.host}`;
        if (!isLocalAddress(originUrl)) {
          return originUrl;
        }
      } catch {}
    }

    const host = req.headers?.['x-forwarded-host'] || (typeof req.get === 'function' ? req.get('host') : null);
    const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'https';
    if (host && !isLocalAddress(host)) {
      return `${proto}://${host}`;
    }
  }

  // 3. Fallback for production: Live Vercel client URL (Never crash)
  if (process.env.NODE_ENV === 'production') {
    return 'https://secureprint-lilac.vercel.app';
  }

  // 4. Default for local dev
  return configured || 'http://localhost:5173';
};

module.exports = {
  isLocalAddress,
  getAppBaseUrl
};
