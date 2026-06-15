import { Routes } from '@angular/router';
import { AdminComponent } from './admin/admin.component';
import { PublicComponent } from './public/public.component';
import { ChampionshipHistoryComponent } from './championship-history/championship-history.component';

export const routes: Routes = [
  { path: 'admin', component: AdminComponent },
  { path: 'championship/history/:userId', component: ChampionshipHistoryComponent },
  { path: '', component: PublicComponent },
];
