# GOLINA e-SESJA

Polskojęzyczny, lokalny **prototyp demonstracyjny 0.1** obsługi sesji. Zrealizowany pierwszy pionowy wycinek ze specyfikacji: administrator → obecność radnego → zapis głosu SQLite → zamknięcie → zatwierdzenie → rzutnik → zdarzenie/Bridge vMix. Nie jest systemem dopuszczonym do urzędowych głosowań.

## Szybkie uruchomienie

Wymagany **Node.js 24 LTS** (Windows 11 lub Linux), npm i przeglądarka. Z katalogu repozytorium:

```sh
npm ci
npm run build
npm run demo:setup
npm start
```

Otwórz lokalnie port 3000, ścieżkę `/admin/director`. `demo:setup` tworzy `.env` z losowym hasłem **DEMO_PASSWORD**, jeżeli plik nie istnieje, oraz bazę `data/golina.sqlite`. Hasła nie wypisuje w logach. W istniejącym `.env` trzeba samemu ustawić hasło minimum 12 znaków. Ponowne uruchomienie zachowuje bazę i konta. Samo zmienienie `.env` nie zmienia haseł już utworzonych kont.

Konta demonstracyjne (jedno hasło z `.env`, wyłącznie do lokalnego demo):

| Login | Widok / uprawnienia |
|---|---|
| `admin` | `/admin/director` – przygotowanie, obecność, sesja, głosowania, zatwierdzanie |
| `radny01` … `radny15` | `/councillor` – własna obecność i własny głos |
| `display` | `/display` – rzutnik, odczyt |
| `production` | `/production` – odczyt, AUTO/MANUAL i awaryjne HIDE |
| `graphics` | `/production/vmix/results` – grafika i potwierdzenie wyrenderowania |
| `bridge` | konto techniczne Bridge, bez zmiany głosów |

Dla różnych ról użyj oddzielnych profili przeglądarki / urządzeń. Cookies są wspólne między kartami jednego profilu. Nie wpisuj hasła w URL. Znak „G” jest roboczym monogramem, nie herbem urzędowym. Wszystkich 15 radnych i cały porządek oznaczono jako fikcyjne dane demonstracyjne.

## Próba sesji

1. Administrator: rozpocznij sesję i otwórz listę obecności.
2. Radni: zaloguj się na każdym urządzeniu i potwierdź obecność. Do otwarcia głosowania potrzeba kworum (dla 15: 8 osób).
3. Administrator: wybierz punkt, przygotuj pytanie i regułę większości, otwórz głosowanie. Lista uprawnionych zostaje utrwalona. Obecności nie można zmieniać podczas głosowania.
4. Radny: naciśnij ZA / PRZECIW / WSTRZYMUJĘ SIĘ. Komunikat „zapisany” pojawia się dopiero po odpowiedzi serwera; po odświeżeniu można sprawdzić własny zapis.
5. Administrator: zamknij, obejrzyj wynik i imienny wykaz, zatwierdź. Zatwierdzony wynik jest niezmienny, widoczny na rzutniku i w CSV. Samo zamknięcie nie publikuje wyniku.
6. Jeżeli działa skonfigurowany Bridge i gotowa grafika vMix, zatwierdzenie zleca emisję aktualnego wyniku na 15 s. Patrz [VMIX_SETUP.md](VMIX_SETUP.md).

## Działa w tym etapie

- Konta z hasłami scrypt, serwerowe sesje HttpOnly/SameSite, CSRF, autoryzacja ról, ograniczenie prób logowania.
- Tworzenie sesji, dodawanie punktów w przygotowaniu, wybór punktu, start/przerwa/wznowienie/koniec.
- Rejestracja obecności z czasem i audytem, kworum, migawka listy uprawnionych przy otwarciu.
- Jeden zapis na radnego i głosowanie, idempotencja, brak zmiany głosu, atomowe zamknięcie, osobne zatwierdzenie.
- Demonstracyjne reguły: zwykła, bezwzględna oddanych głosów, kwalifikowana 2/3 ustawowego składu. Wymagają akceptacji prawnej.
- SSE z aktualizacją wszystkich ekranów, ukrywanie indywidualnych wyborów do zamknięcia (podgląd zamkniętego wyniku tylko administrator).
- Rzutnik, grafiki vMix, panel PREVIEW/PROGRAM, sterownik Bridge z trwałą deduplikacją, handshake gotowości, HIDE i odrzucaniem zaległości.
- CSV zatwierdzonych wyników wszystkich sesji, audyt z łańcuchem hashy i triggerami ochronnymi, spójna kopia SQLite.
- Manifest PWA i bezpieczny komunikat offline. Brak kolejki głosów offline. Zależności sieciowe nie są potrzebne po instalacji.

## Testy i rozwój

```sh
npm run build       # TypeScript + produkcyjny frontend
npm test            # baza, HTTP API, równoległość, reguły, Bridge + mock vMix HTTP
npx playwright install chromium
npm run test:e2e    # prawdziwa przeglądarka, izolowana baza w pamięci
```

Przy zainstalowanym systemowym Chromium ustaw `CHROMIUM_PATH` (w chmurze: `/usr/bin/chromium`), zamiast pobierać Playwright Chromium. Backend pracuje przez `npm run dev`; frontend z HMR w drugim terminalu przez `npm run dev:web`. Zwykłe `npm start` serwuje wynik `npm run build`.

## Zakres odłożony i ograniczenia

- Brak urzędowej listy kont/kadencji, panelu zarządzania kontami i indywidualnych haseł, MFA, resetu hasła i instalatora/usług Windows.
- Demo ma 15 fikcyjnych kont. Pole składu ustawowego jest konfigurowalne, ale nie zastępuje zarządzania rzeczywistym składem.
- Widoki operacyjne korzystają z najnowszej sesji. Eksport obejmuje całą historię; wybieranie starych sesji, pełna wyszukiwarka archiwum i kadencje wymagają dalszej implementacji.
- Brak importu PDF/DOCX/tekstu, dokumentów/załączników, eksportu PDF/DOCX, edycji/drag-and-drop porządku, anulowania/sprostowania głosowań, ręcznych korekt obecności i integracji BIP.
- Rzutnik pokazuje aktualny punkt lub najnowszy zatwierdzony wynik; niezależne sterowanie jego trybem i pełne preview scen będą kolejnym etapem.
- PWA wymaga odbioru instalowalności na rzeczywistych Androidach, certyfikatów i ikon PNG. Nie deklarujemy zgodności WCAG bez audytu.
- Bridge sprawdzono z symulatorem HTTP, nie z fizycznym vMix. Dostęp do oficjalnej dokumentacji był blokowany przez sieć; kontrakt API jest adapterem do weryfikacji na posiadanej wersji. Potwierdzenie PROGRAM oznacza HTTP sukces polecenia, nie pomiar obrazu na wyjściu.
- SQLite chroni transakcje jednego lokalnego serwera; nie jest wdrożeniem HA. Nie używać pliku bazy na udziale sieciowym. Plik, audyt i kopie wymagają ochrony systemu operacyjnego i oddzielnej kopii zabezpieczającej przed zmianą przez administratora pliku.

Szczegóły: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [TEST_PLAN.md](TEST_PLAN.md), [DEPLOY_WINDOWS_11.md](DEPLOY_WINDOWS_11.md), [ANDROID_SETUP.md](ANDROID_SETUP.md), [RUNBOOK_SESSION.md](RUNBOOK_SESSION.md), [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Oryginalne wymagania: [docs/SPECYFIKACJA.md](docs/SPECYFIKACJA.md).
