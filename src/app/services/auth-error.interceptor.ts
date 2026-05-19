import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { AuthService } from './auth.service';

export const authErrorInterceptorFn: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    tap({
      error: (err) => {
        if (err.status === 401 && auth.isSessionExpired !== true) {
          auth.isSessionExpired = true;
          alert('Your session has expired. Please log in again.');
          auth.login();
        }
      },
    })
  );
};
