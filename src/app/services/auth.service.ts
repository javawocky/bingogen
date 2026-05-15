import { inject, Injectable } from '@angular/core';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth0Service);

  isAuthenticated$ = this.auth.isAuthenticated$;
  user$ = this.auth.user$;
  isLoading$ = this.auth.isLoading$;

  isAdmin$: Observable<boolean> = this.user$.pipe(
    map(user => {
      const roles: string[] = user?.['https://motobingo.app/roles'] || [];
      return roles.includes('admin');
    })
  );

  login() {
    this.auth.loginWithRedirect({
      authorizationParams: { connection: 'twitter' },
      appState: { target: window.location.pathname }
    });
  }

  logout() {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  getXHandle(): Observable<string | null> {
    return this.user$.pipe(map(user => user?.['https://motobingo.app/screen_name'] || user?.['screen_name'] || user?.['nickname'] || null));
  }
}
