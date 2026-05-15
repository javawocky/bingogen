import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
  imports: [RouterOutlet],
})
export class AppComponent {
  constructor(private auth: AuthService, private router: Router) {
    this.auth.appState$.subscribe(state => {
      if (state?.target) {
        this.router.navigateByUrl(state.target);
      }
    });
  }
}
