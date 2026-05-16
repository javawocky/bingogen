import { inject, Injectable } from '@angular/core';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { Observable, map, of } from 'rxjs';
import { environment } from '../../environments/environment';

function getDevParams(): { user: string; role: string } | null {
  if (environment.production) return null;
  const params = new URLSearchParams(window.location.search);
  const user = params.get('devUser');
  return user ? { user, role: params.get('devRole') || '' } : null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth0Service);
  private dev = getDevParams();

  isAuthenticated$: Observable<boolean> = this.dev ? of(true) : this.auth.isAuthenticated$;
  isLoading$: Observable<boolean> = this.dev ? of(false) : this.auth.isLoading$;
  user$: Observable<any> = this.dev
    ? of({ sub: `dev|${this.dev.user}`, nickname: this.dev.user, 'https://motobingo.app/screen_name': this.dev.user, 'https://motobingo.app/roles': this.dev.role ? [this.dev.role] : [] })
    : this.auth.user$;

  isAdmin$: Observable<boolean> = this.user$.pipe(
    map(user => {
      const roles: string[] = user?.['https://motobingo.app/roles'] || [];
      return roles.includes('admin');
    })
  );

  login() {
    if (this.dev) return;
    this.auth.loginWithRedirect({
      authorizationParams: { connection: 'twitter' },
      appState: { target: window.location.pathname }
    });
  }

  logout() {
    if (this.dev) { window.location.href = window.location.pathname; return; }
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  getXHandle(): Observable<string | null> {
    return this.user$.pipe(map((user: any) => user?.['https://motobingo.app/screen_name'] || user?.['screen_name'] || user?.['nickname'] || null));
  }
}
