import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import {
  User, Championship, Season, Round, Suggestion,
  BoardResponse, LeaderboardEntry
} from '../models/api.models';

@Component({
  selector: 'app-public',
  templateUrl: './public.component.html',
  styleUrls: ['./public.component.css'],
  imports: [CommonModule, FormsModule],
})
export class PublicComponent implements OnInit, OnDestroy {
  playerHandle = '';
  identifiedUserId: string | null = null;

  users: User[] = [];
  activeRound: Round | null = null;
  championship: Championship | null = null;
  season: Season | null = null;
  noRoundMessage = '';
  leaderboard: LeaderboardEntry[] = [];
  viewingBoard: BoardResponse | null = null;
  viewingBoardUserId: string | null = null;

  publicSuggestionText = '';
  suggestionSubmitted = false;
  voterId = '';

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    const saved = this.getCookie('motobingo_handle');
    if (saved) this.playerHandle = saved;
    this.voterId = this.getCookie('motobingo_voterid') || '';
    if (!this.voterId) {
      this.voterId = crypto.randomUUID();
      this.setCookie('motobingo_voterid', this.voterId, 365);
    }
    this.loadUsers();
    this.loadActiveRound();
  }

  ngOnDestroy() { this.stopPolling(); }

  loadActiveRound() {
    this.api.getActiveRound().subscribe(res => {
      if (res.round) {
        this.activeRound = res.round;
        this.championship = res.championship || null;
        this.season = res.season || null;
        this.noRoundMessage = '';
        this.sortSuggestionsImmediate();
        this.loadLeaderboard();
        if (this.identifiedUserId) this.viewBoard(this.identifiedUserId);
        this.startPolling();
      } else {
        this.activeRound = null;
        this.noRoundMessage = res.message || 'No future round is ready to play just yet. Check back soon!';
      }
    });
  }

  loadUsers() {
    this.api.getUsers().subscribe(u => {
      this.users = u;
      if (this.playerHandle) this.identifyPlayer();
    });
  }

  identifyPlayer() {
    const handle = this.playerHandle.trim().replace(/^@/, '');
    if (!handle) return;
    const user = this.users.find(u => u.xHandle.toLowerCase() === handle.toLowerCase());
    if (user) {
      this.identifiedUserId = user.id;
      this.setCookie('motobingo_handle', handle, 365);
      if (this.activeRound) this.viewBoard(user.id);
    } else {
      this.identifiedUserId = null;
    }
  }

  clearIdentity() {
    this.identifiedUserId = null;
    this.playerHandle = '';
    this.viewingBoard = null;
    this.viewingBoardUserId = null;
    this.deleteCookie('motobingo_handle');
  }

  refreshRound() {
    if (!this.activeRound) return;
    this.api.getRound(this.activeRound.id).subscribe(r => {
      r.suggestions = r.suggestions.filter(s => s.status === 'approved');
      this.activeRound = r;
      this.sortSuggestionsImmediate();
      this.loadLeaderboard();
      if (this.viewingBoardUserId) this.viewBoard(this.viewingBoardUserId);
    });
  }

  loadLeaderboard() {
    if (!this.activeRound) return;
    this.api.getRoundLeaderboard(this.activeRound.id).subscribe(lb => this.leaderboard = lb);
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
    const interval = this.activeRound.phase === 'raceday' ? 10000 : 30000;
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
    // Optimistically update the vote count in the current list
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
    this.api.getCsrf().subscribe(csrf => {
      this.api.submitSuggestion(this.activeRound!.id, this.publicSuggestionText, csrf.token).subscribe({
        next: () => { this.publicSuggestionText = ''; this.suggestionSubmitted = true; },
        error: () => alert('Failed to submit suggestion'),
      });
    });
  }

  shareToX(userId: string) {
    const user = this.users.find(u => u.id === userId);
    const text = `Check out my MotoBingo board for ${this.activeRound?.name || 'the race'}! 🏁`;
    const url = `${window.location.origin}?round=${this.activeRound?.id}&user=${userId}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
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

  private deleteCookie(name: string) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  }
}
