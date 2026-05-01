import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PublicComponent } from './public.component';
import { environment } from '../../environments/environment';

describe('PublicComponent', () => {
  let httpMock: HttpTestingController;
  const API = environment.apiUrl;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.match(() => true));

  function createComponent(activeRound: any = null) {
    const fixture = TestBed.createComponent(PublicComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${API}/users`).flush([]);
    httpMock.expectOne(`${API}/active-round`).flush(
      activeRound ? { round: activeRound, championship: { name: 'SX' }, season: { year: 2026 } }
        : { round: null, message: 'No future round is ready to play just yet. Check back soon!' }
    );
    return fixture;
  }

  it('should create', () => {
    expect(createComponent().componentInstance).toBeTruthy();
  });

  it('should show no-round message when no active round', () => {
    const fixture = createComponent();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No future round is ready to play just yet');
  });

  it('should show round name when active round exists', () => {
    const fixture = createComponent({ id: 'r1', name: 'Anaheim 1', phase: 'suggestions', eventDate: '2026-06-01', suggestions: [], playerIds: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Anaheim 1');
  });

  it('should show suggestion form during suggestions phase', () => {
    const fixture = createComponent({ id: 'r1', name: 'Test', phase: 'suggestions', eventDate: '2026-06-01', suggestions: [], playerIds: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Suggest a Bingo Square');
  });

  it('should not show suggestion form during raceday phase', () => {
    const fixture = createComponent({ id: 'r1', name: 'Test', phase: 'raceday', eventDate: '2026-06-01', suggestions: [], playerIds: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Suggest a Bingo Square');
  });
});
