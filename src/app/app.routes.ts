import { Routes } from '@angular/router';
import { AdminComponent } from './admin/admin.component';
import { PublicComponent } from './public/public.component';

export const routes: Routes = [
  { path: 'admin', component: AdminComponent },
  { path: '', component: PublicComponent },
];
