import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminComponent } from './admin.component';
import { environment } from '../../environments/environment';

describe('AdminComponent', () => {
  let httpMock: HttpTestingController;
  const API = environment.apiUrl;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true);
    sessionStorage.clear();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${API}/championships`).flush([]);
    httpMock.expectOne(`${API}/users`).flush([]);
    return fixture;
  }

  function createComponentWithUsers(users: any[]) {
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${API}/championships`).flush([]);
    httpMock.expectOne(`${API}/users`).flush(users);
    return fixture;
  }

  it('should create', () => {
    const fixture = createComponent();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show MotoBingo title', () => {
    const fixture = createComponent();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('MotoBingo');
  });

  it('should start as non-admin', () => {
    const fixture = createComponent();
    expect(fixture.componentInstance.isAdmin).toBeFalse();
  });

  it('should restore admin session from sessionStorage', () => {
    sessionStorage.setItem('admin_token', 'test');
    const fixture = createComponent();
    expect(fixture.componentInstance.isAdmin).toBeTrue();
  });

  it('should identify player by handle', () => {
    const fixture = createComponentWithUsers([
      { id: 'u1', xHandle: 'rider1', displayName: 'Rider One', createdAt: '' }
    ]);
    const comp = fixture.componentInstance;
    comp.playerHandle = 'rider1';
    comp.identifyPlayer();
    expect(comp.identifiedUserId).toBe('u1');
  });

  it('should identify player case-insensitively', () => {
    const fixture = createComponentWithUsers([
      { id: 'u1', xHandle: 'Rider1', displayName: 'Rider One', createdAt: '' }
    ]);
    const comp = fixture.componentInstance;
    comp.playerHandle = 'rider1';
    comp.identifyPlayer();
    expect(comp.identifiedUserId).toBe('u1');
  });

  it('should strip @ from handle', () => {
    const fixture = createComponentWithUsers([
      { id: 'u1', xHandle: 'rider1', displayName: 'Rider One', createdAt: '' }
    ]);
    const comp = fixture.componentInstance;
    comp.playerHandle = '@rider1';
    comp.identifyPlayer();
    expect(comp.identifiedUserId).toBe('u1');
  });

  it('should not identify unknown handle', () => {
    const fixture = createComponent();
    const comp = fixture.componentInstance;
    comp.playerHandle = 'unknown';
    comp.identifyPlayer();
    expect(comp.identifiedUserId).toBeNull();
  });

  it('should toggle login modal', () => {
    const fixture = createComponent();
    const comp = fixture.componentInstance;
    expect(comp.showLogin).toBeFalse();
    comp.toggleLogin();
    expect(comp.showLogin).toBeTrue();
  });

  it('should login successfully', () => {
    const fixture = createComponent();
    const comp = fixture.componentInstance;
    comp.loginUsername = 'admin';
    comp.loginPassword = 'pass';
    comp.login();
    httpMock.expectOne(`${API}/auth/login`).flush({ token: 'jwt-123' });
    expect(comp.isAdmin).toBeTrue();
    expect(sessionStorage.getItem('admin_token')).toBe('jwt-123');
  });

  it('should show error on failed login', () => {
    const fixture = createComponent();
    const comp = fixture.componentInstance;
    comp.login();
    httpMock.expectOne(`${API}/auth/login`).flush({ error: 'bad' }, { status: 401, statusText: 'Unauthorized' });
    expect(comp.isAdmin).toBeFalse();
    expect(comp.loginError).toBe('Invalid credentials');
  });

  it('should logout and clear session', () => {
    sessionStorage.setItem('admin_token', 'test');
    const fixture = createComponent();
    const comp = fixture.componentInstance;
    comp.logout();
    expect(comp.isAdmin).toBeFalse();
    expect(sessionStorage.getItem('admin_token')).toBeNull();
  });

  it('should clear player identity', () => {
    const fixture = createComponentWithUsers([
      { id: 'u1', xHandle: 'rider1', displayName: 'Rider One', createdAt: '' }
    ]);
    const comp = fixture.componentInstance;
    comp.playerHandle = 'rider1';
    comp.identifyPlayer();
    expect(comp.identifiedUserId).toBe('u1');
    comp.clearIdentity();
    expect(comp.identifiedUserId).toBeNull();
    expect(comp.playerHandle).toBe('');
  });
});
