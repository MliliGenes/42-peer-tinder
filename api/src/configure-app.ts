import { INestApplication } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  const trustProxyRaw = process.env.TRUST_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(trustProxyRaw) || Number(trustProxyRaw) > 3) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 3');
  }
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', Number(trustProxyRaw));
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use((_request: unknown, response: any, next: () => void) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
}
