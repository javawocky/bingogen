import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  User, Championship, Season, Round, Suggestion,
  BoardResponse, LeaderboardEntry, SeasonLeaderboardEntry
} from '../models/api.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Auth
  getMe(handle?: string): Observable<{ user: User; roles: string[] }> {
    const params = handle ? `?handle=${encodeURIComponent(handle)}` : '';
    return this.http.get<{ user: User; roles: string[] }>(`${this.base}/auth/me${params}`);
  }

  // Users
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/users`);
  }

  createUser(xHandle: string, displayName: string): Observable<User> {
    return this.http.post<User>(`${this.base}/users`, { xHandle, displayName });
  }

  updateUser(id: string, data: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.base}/users/${id}`, data);
  }

  deleteUser(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/users/${id}`);
  }

  // Championships
  getChampionships(): Observable<Championship[]> {
    return this.http.get<Championship[]>(`${this.base}/championships`);
  }

  createChampionship(name: string, shortCode: string): Observable<Championship> {
    return this.http.post<Championship>(`${this.base}/championships`, { name, shortCode });
  }

  // Seasons
  getSeasons(championshipId: string): Observable<Season[]> {
    return this.http.get<Season[]>(`${this.base}/championships/${championshipId}/seasons`);
  }

  createSeason(championshipId: string, year: number): Observable<Season> {
    return this.http.post<Season>(`${this.base}/championships/${championshipId}/seasons`, { year });
  }

  // Active round
  getActiveRound(): Observable<{ round: Round | null; championship?: Championship; season?: Season; message?: string }> {
    return this.http.get<{ round: Round | null; championship?: Championship; season?: Season; message?: string }>(`${this.base}/active-round`);
  }

  setActiveRound(roundId: string | null): Observable<unknown> {
    return this.http.put(`${this.base}/active-round`, { roundId });
  }

  // Rounds
  getRounds(seasonId: string): Observable<Round[]> {
    return this.http.get<Round[]>(`${this.base}/seasons/${seasonId}/rounds`);
  }

  getRound(roundId: string): Observable<Round> {
    return this.http.get<Round>(`${this.base}/rounds/${roundId}`);
  }

  createRound(seasonId: string, data: { name: string; eventDate: string; phaseDates?: Round['phaseDates'] }): Observable<Round> {
    return this.http.post<Round>(`${this.base}/seasons/${seasonId}/rounds`, data);
  }

  deleteRound(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/rounds/${id}`);
  }

  updateRound(roundId: string, data: Partial<Round>): Observable<Round> {
    return this.http.put<Round>(`${this.base}/rounds/${roundId}`, data);
  }

  advancePhase(roundId: string, phase: Round['phase']): Observable<Round> {
    return this.http.put<Round>(`${this.base}/rounds/${roundId}/phase`, { phase });
  }

  // Suggestions
  submitSuggestion(roundId: string, text: string): Observable<Suggestion> {
    return this.http.post<Suggestion>(`${this.base}/rounds/${roundId}/suggestions`, { text });
  }

  adminSubmitSuggestion(roundId: string, text: string): Observable<Suggestion> {
    return this.http.post<Suggestion>(`${this.base}/rounds/${roundId}/suggestions`, { text, adminApprove: true });
  }

  updateSuggestion(roundId: string, suggestionId: string, data: Partial<Suggestion>): Observable<Suggestion> {
    return this.http.put<Suggestion>(`${this.base}/rounds/${roundId}/suggestions/${suggestionId}`, data);
  }

  deleteSuggestion(roundId: string, suggestionId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/rounds/${roundId}/suggestions/${suggestionId}`);
  }

  voteSuggestion(roundId: string, suggestionId: string, voterId: string): Observable<{ votes: number; voted: boolean }> {
    return this.http.post<{ votes: number; voted: boolean }>(
      `${this.base}/rounds/${roundId}/suggestions/${suggestionId}/vote`, { voterId }
    );
  }

  // Players in round
  addPlayersToRound(roundId: string, userIds: string[]): Observable<Round> {
    return this.http.post<Round>(`${this.base}/rounds/${roundId}/players`, { userIds });
  }

  removePlayerFromRound(roundId: string, userId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/rounds/${roundId}/players/${userId}`);
  }

  // Boards
  generateBoards(roundId: string): Observable<{ boardSize: number; playerCount: number }> {
    return this.http.post<{ boardSize: number; playerCount: number }>(`${this.base}/rounds/${roundId}/generate-boards`, {});
  }

  getBoard(roundId: string, userId: string): Observable<BoardResponse> {
    return this.http.get<BoardResponse>(`${this.base}/rounds/${roundId}/boards/${userId}`);
  }

  // Leaderboard
  getRoundLeaderboard(roundId: string): Observable<LeaderboardEntry[]> {
    return this.http.get<LeaderboardEntry[]>(`${this.base}/rounds/${roundId}/leaderboard`);
  }

  getSeasonLeaderboard(seasonId: string): Observable<SeasonLeaderboardEntry[]> {
    return this.http.get<SeasonLeaderboardEntry[]>(`${this.base}/seasons/${seasonId}/leaderboard`);
  }
}
