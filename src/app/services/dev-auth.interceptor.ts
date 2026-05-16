import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const devAuthInterceptorFn: HttpInterceptorFn = (req, next) => {
  if (environment.production) return next(req);

  const params = new URLSearchParams(window.location.search);
  const devUser = params.get('devUser');
  if (!devUser) return next(req);

  const headers: Record<string, string> = { 'X-Dev-User': devUser };
  const devRole = params.get('devRole');
  if (devRole) headers['X-Dev-Role'] = devRole;

  return next(req.clone({ setHeaders: headers }));
};
