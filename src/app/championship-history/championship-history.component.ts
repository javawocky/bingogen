import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { BingoBoardComponent, BingoBoardSquare } from '../shared/bingo-board.component';

@Component({
  selector: 'app-championship-history',
  standalone: true,
  imports: [CommonModule, BingoBoardComponent],
  templateUrl: './championship-history.component.html',
  styleUrls: ['./championship-history.component.css'],
})
export class ChampionshipHistoryComponent implements OnInit {
  user: { id: string; displayName: string; xHandle: string } | null = null;
  rounds: { roundName: string; eventDate: string; score: number; hasBingo: boolean; boardSize: number; squares: BingoBoardSquare[] }[] = [];
  loading = true;
  error = '';

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {}

  ngOnInit() {
    const userId = this.route.snapshot.paramMap.get('userId')!;
    const seasonId = this.route.snapshot.queryParamMap.get('season');
    if (!seasonId) { this.error = 'No season specified'; this.loading = false; return; }

    this.api.getUserSeasonBoards(seasonId, userId).subscribe({
      next: (res) => {
        this.user = res.user;
        this.rounds = res.rounds.map(r => ({
          roundName: r.roundName,
          eventDate: r.eventDate,
          score: r.score,
          hasBingo: r.hasBingo,
          boardSize: r.boardSize,
          squares: r.squares.map(sq => ({
            text: sq.suggestionId === 'FREE' ? '' : sq.text,
            isFree: sq.suggestionId === 'FREE',
            isEmpty: false,
            completed: sq.completed,
          })),
        }));
        this.loading = false;
      },
      error: () => { this.error = 'Could not load data'; this.loading = false; },
    });
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  goBack() { this.router.navigate(['/']); }
}
