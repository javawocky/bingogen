import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import {
  User, Championship, Season, Round, Suggestion,
  BoardResponse, LeaderboardEntry, BoardSquare
} from '../models/api.models';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
  imports: [CommonModule, FormsModule],
})
export class AdminComponent implements OnInit, OnDestroy {
  // Auth
  isAdmin = false;
  loginUsername = '';
  loginPassword = '';
  loginError = '';
  showLogin = false;

  // Player identification
  playerHandle = '';
  identifiedUserId: string | null = null;

  // Data
  users: User[] = [];
  championships: Championship[] = [];
  seasons: Season[] = [];
  rounds: Round[] = [];
  activeRound: Round | null = null;
  leaderboard: LeaderboardEntry[] = [];
  viewingBoard: BoardResponse | null = null;
  viewingBoardUserId: string | null = null;

  // Admin forms
  newSeasonYear = new Date().getFullYear();
  newRoundName = '';
  newRoundDate = '';
  newUserHandle = '';
  newUserName = '';
  newSuggestionText = '';
  showRoundModal = false;
  editingRoundId: string | null = null;

  // Navigation
  selectedChampionship: Championship | null = null;
  selectedSeason: Season | null = null;
  activePublicRoundId: string | null = null;

  // Year dropdown options — existing seasons + future years not yet created
  get seasonOptions(): { year: number; seasonId: string | null; active: boolean }[] {
    const now = new Date().getFullYear();
    const existingYears = new Set(this.seasons.map(s => s.year));
    const options: { year: number; seasonId: string | null; active: boolean }[] = [];

    // Add all existing seasons (including historic)
    for (const s of this.seasons) {
      options.push({ year: s.year, seasonId: s.id, active: s.active });
    }

    // Add future years that don't exist yet (up to +5)
    for (let y = now; y <= now + 5; y++) {
      if (!existingYears.has(y)) {
        options.push({ year: y, seasonId: null, active: false });
      }
    }

    return options.sort((a, b) => a.year - b.year);
  }

  // Suggestion (public)
  publicSuggestionText = '';
  suggestionSubmitted = false;

  // Polling
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    if (sessionStorage.getItem('admin_token')) {
      this.isAdmin = true;
    }

    const saved = this.getCookie('motobingo_handle');
    if (saved) this.playerHandle = saved;

    this.loadChampionships();
    this.loadUsers();
    this.loadActivePublicRound();
  }

  loadActivePublicRound() {
    this.api.getActiveRound().subscribe(res => {
      this.activePublicRoundId = res.round?.id || null;
    });
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  // --- Auth ---
  toggleLogin() { this.showLogin = !this.showLogin; this.loginError = ''; }

  login() {
    this.api.login(this.loginUsername, this.loginPassword).subscribe({
      next: (res) => {
        sessionStorage.setItem('admin_token', res.token);
        this.isAdmin = true;
        this.showLogin = false;
        this.loginError = '';
        this.refreshRound();
      },
      error: () => { this.loginError = 'Invalid credentials'; }
    });
  }

  logout() {
    sessionStorage.removeItem('admin_token');
    this.isAdmin = false;
    this.refreshRound();
  }

  // --- Player identification ---
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

  // --- Data loading ---
  loadChampionships() {
    this.api.getChampionships().subscribe(c => {
      this.championships = c;
      const savedId = localStorage.getItem('admin_champId');
      const match = c.find(ch => ch.id === savedId);
      if (match) this.selectChampionship(match);
    });
  }

  loadUsers() {
    this.api.getUsers().subscribe(u => {
      this.users = u;
      if (this.playerHandle) this.identifyPlayer();
    });
  }

  onChampionshipChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    const champ = this.championships.find(c => c.id === id);
    if (champ) this.selectChampionship(champ);
  }

  selectChampionship(c: Championship) {
    this.selectedChampionship = c;
    this.selectedSeason = null;
    this.activeRound = null;
    localStorage.setItem('admin_champId', c.id);
    this.api.getSeasons(c.id).subscribe(s => {
      this.seasons = s;
      const savedId = localStorage.getItem('admin_seasonId');
      const match = s.find(se => se.id === savedId);
      if (match) this.selectSeason(match);
    });
  }

  selectSeason(s: Season) {
    this.selectedSeason = s;
    this.activeRound = null;
    localStorage.setItem('admin_seasonId', s.id);
    this.api.getRounds(s.id).subscribe(r => {
      this.rounds = r.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
      const savedId = localStorage.getItem('admin_roundId');
      const match = r.find(rd => rd.id === savedId);
      const active = match || r.find(rd => rd.phase !== 'complete') || r[r.length - 1];
      if (active) this.selectRound(active);
    });
  }

  selectRound(r: Round) {
    localStorage.setItem('admin_roundId', r.id);
    this.api.getRound(r.id).subscribe(round => {
      this.activeRound = round;
      this.loadLeaderboard();
      if (this.identifiedUserId) this.viewBoard(this.identifiedUserId);
      this.startPolling();
    });
  }

  refreshRound() {
    if (this.activeRound) {
      this.api.getRound(this.activeRound.id).subscribe(r => {
        this.activeRound = r;
        this.loadLeaderboard();
      });
    }
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

  // --- Polling ---
  startPolling() {
    this.stopPolling();
    if (!this.activeRound || this.activeRound.phase === 'complete') return;
    const interval = this.activeRound.phase === 'raceday' ? 10000 : 30000;
    this.pollInterval = setInterval(() => this.refreshRound(), interval);
  }

  stopPolling() {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }

  // --- Admin: Seasons ---
  onSeasonChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    // value is either a season ID (existing) or "new:YEAR"
    if (value.startsWith('new:')) {
      const year = parseInt(value.split(':')[1], 10);
      if (!this.selectedChampionship || !year) return;
      this.api.createSeason(this.selectedChampionship.id, year).subscribe(() => {
        this.selectChampionship(this.selectedChampionship!);
      });
    } else {
      const season = this.seasons.find(s => s.id === value);
      if (season) this.selectSeason(season);
    }
  }

  createSeason() {
    // kept for compatibility but main flow is via dropdown
    if (!this.selectedChampionship || !this.newSeasonYear) return;
    this.api.createSeason(this.selectedChampionship.id, this.newSeasonYear).subscribe(() => {
      this.selectChampionship(this.selectedChampionship!);
    });
  }

  // --- Admin: Rounds ---
  openAddRoundModal() {
    this.editingRoundId = null;
    this.newRoundName = '';
    this.newRoundDate = '';
    this.showRoundModal = true;
  }

  openEditRoundModal(r: Round) {
    this.editingRoundId = r.id;
    this.newRoundName = r.name;
    this.newRoundDate = r.eventDate;
    this.showRoundModal = true;
  }

  createRound() {
    if (!this.selectedSeason || !this.newRoundName.trim() || !this.newRoundDate) return;
    this.api.createRound(this.selectedSeason.id, { name: this.newRoundName, eventDate: this.newRoundDate }).subscribe(() => {
      this.newRoundName = '';
      this.newRoundDate = '';
      this.showRoundModal = false;
      this.selectSeason(this.selectedSeason!);
    });
  }

  saveEditRound() {
    if (!this.editingRoundId || !this.newRoundName.trim() || !this.newRoundDate) return;
    this.api.updateRound(this.editingRoundId, { name: this.newRoundName, eventDate: this.newRoundDate }).subscribe(() => {
      this.showRoundModal = false;
      this.editingRoundId = null;
      this.selectSeason(this.selectedSeason!);
    });
  }

  advancePhase() {
    if (!this.activeRound) return;
    const order: Round['phase'][] = ['suggestions', 'boards', 'raceday', 'complete'];
    const next = order[order.indexOf(this.activeRound.phase) + 1];
    if (!next || !confirm(`Advance to "${next}" phase?`)) return;
    this.api.advancePhase(this.activeRound.id, next).subscribe(() => this.refreshRound());
  }

  deleteRound(id: string) {
    if (!confirm('Delete this round? This cannot be undone.')) return;
    this.api.deleteRound(id).subscribe(() => {
      if (this.activeRound?.id === id) this.activeRound = null;
      if (this.activePublicRoundId === id) this.activePublicRoundId = null;
      this.selectSeason(this.selectedSeason!);
    });
  }

  toggleActiveRound(roundId: string) {
    if (this.activePublicRoundId === roundId) {
      // Deactivate
      this.api.setActiveRound(null).subscribe(() => {
        this.activePublicRoundId = null;
      });
    } else {
      if (!confirm('Are you sure you want to change the active round? Users will see the new round by default.')) return;
      this.api.setActiveRound(roundId).subscribe(() => {
        this.activePublicRoundId = roundId;
      });
    }
  }

  // --- Admin: Users ---
  createUser() {
    if (!this.newUserHandle.trim() || !this.newUserName.trim()) return;
    this.api.createUser(this.newUserHandle, this.newUserName).subscribe(() => {
      this.newUserHandle = '';
      this.newUserName = '';
      this.loadUsers();
    });
  }

  deleteUser(id: string) {
    if (!confirm('Delete this user?')) return;
    this.api.deleteUser(id).subscribe(() => this.loadUsers());
  }

  addPlayerToRound(userId: string) {
    if (!this.activeRound) return;
    this.api.addPlayersToRound(this.activeRound.id, [userId]).subscribe(() => this.refreshRound());
  }

  removePlayerFromRound(userId: string) {
    if (!this.activeRound) return;
    this.api.removePlayerFromRound(this.activeRound.id, userId).subscribe(() => this.refreshRound());
  }

  // --- Admin: Suggestions ---
  addSuggestion() {
    if (!this.activeRound || !this.newSuggestionText.trim()) return;
    this.api.adminAddSuggestion(this.activeRound.id, this.newSuggestionText).subscribe(() => {
      this.newSuggestionText = '';
      this.refreshRound();
    });
  }

  // --- Admin: Suggestion editing ---
  editingSuggestionId: string | null = null;
  editingSuggestionText = '';

  startEditSuggestion(s: Suggestion) {
    this.editingSuggestionId = s.id;
    this.editingSuggestionText = s.text;
  }

  saveEditSuggestion(s: Suggestion) {
    if (!this.activeRound || !this.editingSuggestionText.trim()) { this.cancelEditSuggestion(); return; }
    if (this.editingSuggestionText.trim() === s.text) { this.cancelEditSuggestion(); return; }
    this.api.updateSuggestion(this.activeRound.id, s.id, { text: this.editingSuggestionText.trim().slice(0, 200) }).subscribe(() => {
      this.cancelEditSuggestion();
      this.refreshRound();
    });
  }

  cancelEditSuggestion() {
    this.editingSuggestionId = null;
    this.editingSuggestionText = '';
  }

  approveSuggestion(s: Suggestion) {
    if (!this.activeRound) return;
    this.api.updateSuggestion(this.activeRound.id, s.id, { status: 'approved' }).subscribe(() => this.refreshRound());
  }

  rejectSuggestion(s: Suggestion) {
    if (!this.activeRound) return;
    this.api.updateSuggestion(this.activeRound.id, s.id, { status: 'rejected' }).subscribe(() => this.refreshRound());
  }

  toggleSelected(s: Suggestion) {
    if (!this.activeRound) return;
    this.api.updateSuggestion(this.activeRound.id, s.id, { selected: !s.selected }).subscribe(() => this.refreshRound());
  }

  markComplete(s: Suggestion) {
    if (!this.activeRound) return;
    this.api.updateSuggestion(this.activeRound.id, s.id, { completed: !s.completed }).subscribe(() => {
      this.refreshRound();
      if (this.viewingBoardUserId) this.viewBoard(this.viewingBoardUserId);
    });
  }

  generateBoards() {
    if (!this.activeRound) return;
    this.api.generateBoards(this.activeRound.id).subscribe({
      next: () => { this.refreshRound(); this.loadLeaderboard(); },
      error: (e) => alert(e.error?.error || 'Failed to generate boards'),
    });
  }

  // --- Public: Suggestions ---
  submitPublicSuggestion() {
    if (!this.activeRound || !this.publicSuggestionText.trim()) return;
    this.api.getCsrf().subscribe(csrf => {
      this.api.submitSuggestion(this.activeRound!.id, this.publicSuggestionText, csrf.token).subscribe({
        next: () => { this.publicSuggestionText = ''; this.suggestionSubmitted = true; },
        error: () => alert('Failed to submit suggestion'),
      });
    });
  }

  // --- Sharing ---
  getBoardUrl(userId: string): string {
    if (!this.activeRound) return '';
    return `${window.location.origin}?round=${this.activeRound.id}&user=${userId}`;
  }

  shareToX(userId: string) {
    const user = this.users.find(u => u.id === userId);
    const text = `Check out my MotoBingo board for ${this.activeRound?.name || 'the race'}! 🏁`;
    const url = this.getBoardUrl(userId);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  }

  // --- Helpers ---
  get selectedSuggestionCount(): number {
    return this.activeRound?.suggestions.filter(s => s.selected).length || 0;
  }

  getUserById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  isPlayerInRound(userId: string): boolean {
    return this.activeRound?.playerIds.includes(userId) || false;
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
