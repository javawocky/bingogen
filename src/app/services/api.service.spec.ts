import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should login and return token', () => {
    service.login('admin', 'pass').subscribe(res => {
      expect(res.token).toBe('test-jwt');
    });
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'admin', password: 'pass' });
    req.flush({ token: 'test-jwt' });
  });

  it('should get users', () => {
    service.getUsers().subscribe(users => {
      expect(users.length).toBe(1);
      expect(users[0].xHandle).toBe('rider1');
    });
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: '1', xHandle: 'rider1', displayName: 'Rider', createdAt: '' }]);
  });

  it('should create user with admin headers', () => {
    sessionStorage.setItem('admin_token', 'fake-jwt');
    service.createUser('rider2', 'Rider 2').subscribe(u => {
      expect(u.xHandle).toBe('rider2');
    });
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt');
    req.flush({ id: '2', xHandle: 'rider2', displayName: 'Rider 2', createdAt: '' });
    sessionStorage.removeItem('admin_token');
  });

  it('should get championships', () => {
    service.getChampionships().subscribe(c => expect(c.length).toBe(0));
    httpMock.expectOne(`${environment.apiUrl}/championships`).flush([]);
  });

  it('should get round with admin headers', () => {
    sessionStorage.setItem('admin_token', 'fake-jwt');
    service.getRound('r1').subscribe(r => expect(r.name).toBe('Anaheim'));
    const req = httpMock.expectOne(`${environment.apiUrl}/rounds/r1`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt');
    req.flush({ id: 'r1', name: 'Anaheim', phase: 'suggestions', suggestions: [], playerIds: [] });
    sessionStorage.removeItem('admin_token');
  });

  it('should submit suggestion with CSRF token', () => {
    service.submitSuggestion('r1', 'Crash in whoops', 'csrf-123').subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/rounds/r1/suggestions`);
    expect(req.request.headers.get('X-CSRF-Token')).toBe('csrf-123');
    expect(req.request.body).toEqual({ text: 'Crash in whoops' });
    req.flush({ id: 's1', text: 'Crash in whoops', status: 'pending' });
  });

  it('should get board for user', () => {
    service.getBoard('r1', 'u1').subscribe(b => {
      expect(b.boardSize).toBe(3);
      expect(b.squares.length).toBe(9);
    });
    const req = httpMock.expectOne(`${environment.apiUrl}/rounds/r1/boards/u1`);
    req.flush({ boardSize: 3, squares: Array(9).fill({ position: 0, text: 'test', completed: false }), score: 0, hasBingo: false });
  });

  it('should get round leaderboard', () => {
    service.getRoundLeaderboard('r1').subscribe(lb => expect(lb.length).toBe(2));
    httpMock.expectOne(`${environment.apiUrl}/rounds/r1/leaderboard`).flush([
      { userId: 'u1', score: 100, hasBingo: true },
      { userId: 'u2', score: 3, hasBingo: false },
    ]);
  });
});
