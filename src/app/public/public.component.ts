import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { BingoBoardComponent, BingoBoardSquare } from '../shared/bingo-board.component';
import {
  User, Championship, Season, Round, Suggestion,
  BoardResponse, LeaderboardEntry, SeasonLeaderboardEntry
} from '../models/api.models';

@Component({
  selector: 'app-public',
  templateUrl: './public.component.html',
  styleUrls: ['./public.component.css'],
  imports: [CommonModule, FormsModule, BingoBoardComponent],
})
export class PublicComponent implements OnInit, OnDestroy {
  playerHandle = '';
  identifiedUserId: string | null = null;
  isAuthenticated = false;
  authLoading = true;

  users: User[] = [];
  activeRound: Round | null = null;
  championship: Championship | null = null;
  season: Season | null = null;
  noRoundMessage = '';
  leaderboard: LeaderboardEntry[] = [];
  seasonLeaderboard: SeasonLeaderboardEntry[] = [];
  viewingBoard: BoardResponse | null = null;
  viewingBoardUserId: string | null = null;

  publicSuggestionText = '';
  suggestionSubmitted = false;
  suggestionError = '';
  showSuggestionModal = false;
  toastMessage = '';
  voterId = '';

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService, private authService: AuthService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.voterId = this.getCookie('motobingo_voterid') || '';
    if (!this.voterId) {
      this.voterId = crypto.randomUUID();
      this.setCookie('motobingo_voterid', this.voterId, 365);
    }

    this.authService.isLoading$.subscribe(loading => this.authLoading = loading);
    this.authService.isAuthenticated$.subscribe(authed => {
      this.isAuthenticated = authed;
      if (authed) this.loadMe();
    });

    this.loadUsers();
    this.loadActiveRound();
  }

  ngOnDestroy() { this.stopPolling(); }

  login() { this.authService.login(); }
  logout() { this.authService.logout(); }

  private loadMe() {
    this.authService.getXHandle().subscribe(handle => {
      const param = handle ? `?handle=${encodeURIComponent(handle)}` : '';
      this.api.getMe(handle || undefined).subscribe({
        next: (res) => {
          this.playerHandle = res.user.xHandle;
          this.identifiedUserId = res.user.id;
          this.loadUsers();
          if (this.activeRound) this.viewBoard(res.user.id);
        },
        error: () => {}
      });
    });
  }

  loadActiveRound() {
    this.api.getActiveRound().subscribe(res => {
      if (res.round) {
        this.activeRound = res.round;
        this.championship = res.championship || null;
        this.season = res.season || null;
        this.noRoundMessage = '';
        this.sortSuggestionsImmediate();
        this.loadLeaderboard();
        this.loadSeasonLeaderboard();
        if (this.identifiedUserId) this.viewBoard(this.identifiedUserId);
        this.startPolling();
      } else {
        this.activeRound = null;
        this.noRoundMessage = res.message || 'No future round is ready to play just yet. Check back soon!';
      }
    });
  }

  loadUsers() {
    this.api.getUsers().subscribe(u => this.users = u);
  }

  refreshRound() {
    if (!this.activeRound) return;
    this.api.getRound(this.activeRound.id).subscribe(r => {
      r.suggestions = r.suggestions.filter(s => s.status === 'approved');
      this.activeRound = r;
      this.sortSuggestionsImmediate();
      this.loadLeaderboard();
      this.loadSeasonLeaderboard();
      if (this.viewingBoardUserId) this.viewBoard(this.viewingBoardUserId);
    });
  }

  loadLeaderboard() {
    if (!this.activeRound) return;
    this.api.getRoundLeaderboard(this.activeRound.id).subscribe(lb => this.leaderboard = lb);
  }

  loadSeasonLeaderboard() {
    if (!this.season) return;
    this.api.getSeasonLeaderboard(this.season.id).subscribe(lb => this.seasonLeaderboard = lb.slice(0, 100));
  }

  viewBoard(userId: string) {
    if (!this.activeRound) return;
    this.viewingBoardUserId = userId;
    this.api.getBoard(this.activeRound.id, userId).subscribe({
      next: (b) => this.viewingBoard = b,
      error: () => this.viewingBoard = null,
    });
  }

  startPolling() {
    this.stopPolling();
    if (!this.activeRound || this.activeRound.phase === 'complete') return;
    const interval = this.activeRound.phase === 'boards' ? 10000 : 30000;
    this.pollInterval = setInterval(() => this.refreshRound(), interval);
  }

  stopPolling() {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }

  // --- Suggestions ---
  sortedSuggestions: Suggestion[] = [];
  private sortTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleSuggestionSort() {
    if (this.sortTimer) clearTimeout(this.sortTimer);
    this.sortTimer = setTimeout(() => {
      if (!this.activeRound) return;
      this.sortedSuggestions = [...this.activeRound.suggestions]
        .sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))
        .slice(0, 50);
    }, 2000);
  }

  private sortSuggestionsImmediate() {
    if (this.sortTimer) clearTimeout(this.sortTimer);
    if (!this.activeRound) { this.sortedSuggestions = []; return; }
    this.sortedSuggestions = [...this.activeRound.suggestions]
      .sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0))
      .slice(0, 50);
  }

  hasVoted(s: { votes: string[] }): boolean {
    return (s.votes || []).includes(this.voterId);
  }

  toggleVote(s: { id: string }) {
    if (!this.activeRound) return;
    const suggestion = this.activeRound.suggestions.find(x => x.id === s.id);
    if (suggestion) {
      if (!suggestion.votes) suggestion.votes = [];
      const idx = suggestion.votes.indexOf(this.voterId);
      if (idx === -1) suggestion.votes.push(this.voterId);
      else suggestion.votes.splice(idx, 1);
    }
    this.scheduleSuggestionSort();
    this.api.voteSuggestion(this.activeRound.id, s.id, this.voterId).subscribe();
  }

  submitPublicSuggestion() {
    if (!this.activeRound || !this.publicSuggestionText.trim()) return;
    this.suggestionError = '';
    this.api.submitSuggestion(this.activeRound.id, this.publicSuggestionText).subscribe({
      next: () => {
        this.publicSuggestionText = '';
        this.suggestionSubmitted = true;
        this.showSuggestionModal = false;
        this.showToast('Suggestion submitted! 🎉');
      },
      error: (e) => {
        if (e.status === 401) {
          this.suggestionError = 'Please login to submit suggestions';
        } else {
          this.suggestionError = e.error?.error || 'Something went wrong. Please try again.';
        }
      },
    });
  }

  shareToX(userId: string) {
    const user = this.users.find(u => u.id === userId);
    const text = `Check out my MotoBingo board for ${this.activeRound?.name || 'the race'}! 🏁`;
    const url = `${window.location.origin}?round=${this.activeRound?.id}&user=${userId}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  }

  get boardPreviewSize(): number { return 5; }

  get boardPreviewSquares(): { text: string; isFree: boolean; isEmpty: boolean; completed: boolean }[] {
    const size = this.boardPreviewSize;
    const total = size * size;
    const centre = Math.floor(total / 2);
    const selected = this.activeRound?.suggestions.filter(s => s.selected) || [];
    const squares: { text: string; isFree: boolean; isEmpty: boolean; completed: boolean }[] = [];
    let idx = 0;
    for (let i = 0; i < total; i++) {
      if (i === centre) {
        squares.push({ text: 'FREE', isFree: true, isEmpty: false, completed: false });
      } else if (idx < selected.length) {
        squares.push({ text: selected[idx].text, isFree: false, isEmpty: false, completed: selected[idx].completed });
        idx++;
      } else {
        squares.push({ text: '', isFree: false, isEmpty: true, completed: false });
      }
    }
    return squares;
  }

  get previewBoardCells(): BingoBoardSquare[] {
    return this.boardPreviewSquares;
  }

  get viewingBoardCells(): BingoBoardSquare[] {
    if (!this.viewingBoard) return [];
    return this.viewingBoard.squares.map(sq => ({
      text: sq.suggestionId === 'FREE' ? '' : sq.text,
      isFree: sq.suggestionId === 'FREE',
      isEmpty: false,
      completed: sq.completed,
    }));
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  showToast(message: string) {
    this.toastMessage = message;
    setTimeout(() => this.toastMessage = '', 3000);
  }

  getUserById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  getGridCols(boardSize: number): string {
    return `repeat(${boardSize}, 1fr)`;
  }

  private setCookie(name: string, value: string, days: number) {
    const d = new Date(); d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
  }

  private getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? match[1] : null;
  }
}
