# GOLINA e-SESJA — kompletna specyfikacja dla Codexa

**Wersja:** 1.0  
**Data zebrania wymagań:** 19.10.2026  
**Status:** specyfikacja i polecenie wykonawcze; nie jest to gotowy ani zatwierdzony prawnie system głosowania.

> **INSTRUKCJA DLA CODEXA:** Przeczytaj cały dokument i zbuduj aplikację etapami. Najpierw przedstaw krótki plan, architekturę, model danych i listę ryzyk, następnie implementuj działający pionowy wycinek: administrator → tablet Android → zapis głosu w bazie → zamknięcie/zatwierdzenie → rzutnik → automatyczna nakładka vMix. Nie poprzestawaj na makiecie. W repozytorium dodaj instrukcję uruchomienia, migracje, testy oraz jawnie opisz, czego nie udało się zrealizować. Nie określaj prototypu mianem produkcyjnego systemu głosowania przed audytem i testami odbiorowymi.

## 1. Cel projektu

Stwórz **GOLINA e-SESJA**, polskojęzyczny system obsługi sesji Rady Miejskiej w Golinie: przygotowanie sesji i porządku obrad, elektroniczna obecność, jawne głosowanie imienne z tabletów Android, zarządzanie przebiegiem sesji, osobny ekran na rzutniku, automatyczne prezentowanie zatwierdzonych wyników w **vMix** i raporty/archiwum.

Inspiracje wizualne: trzy przesłane zrzuty pokazujące (1) wyniki imienne na dużym ekranie, (2) wyświetlanie przedmiotu głosowania w Golinie, (3) kafelkową macierz głosujących. Obrazy znajdują się w katalogu `referencje/` w ZIP. Są wyłącznie inspiracją, nie należy kopiować istniejącego interfejsu 1:1.

**Uwaga o porządku obrad:** w rozmowie użytkownik zapowiedział dołączenie aktualnego porządku, ale dostępne są tylko trzy zrzuty ekranu, a nie pełny plik porządku obrad. Implementuj import PDF/DOCX/tekstu; nie traktuj przykładowych punktów jako oficjalnego porządku sesji.

## 2. Ustalenia zatwierdzone przez zamawiającego — wiążące

| Parametr | Decyzja |
|---|---|
| Laptop administratora | **Windows 11** |
| Lokalizacja serwera i bazy | **Na laptopie administratora** |
| Komputer realizatora transmisji | **Osobny komputer** |
| Oprogramowanie realizacyjne | **vMix** (nie „FMX”) |
| Tablety radnych | **Android**, planowo **15**; liczba konfigurowalna |
| Łączność | **Istniejąca sieć Wi-Fi urzędu**; urządzenia w jednej infrastrukturze LAN/Wi-Fi |
| Internet podczas sesji | Funkcje lokalne muszą działać **bez internetu**; wysyłanie transmisji do internetu jest osobną sprawą |
| Publikacja zatwierdzonego wyniku do vMix | **Automatyczna**, bez obowiązkowego kliknięcia realizatora |
| Rzutnik | Oddzielny widok, preferencyjnie drugi ekran w Windows („Rozszerz”) |
| Obsługa całości | Administrator ma mieć centralny **Reżyser sesji** i pełną kontrolę nad sesją |
| Język i branding | Polski, „GOLINA e-SESJA”, oficjalny herb dostarczony przez urząd |

**Uwaga:** „Jedna sieć Wi-Fi” oznacza wspólną kontrolowaną infrastrukturę, niekoniecznie jeden SSID. Administrator sieci powinien zatwierdzić wydzielony VLAN/SSID sesyjny i reguły dostępu — nie używać sieci gościnnej z izolacją klientów.

## 3. Cztery główne widoki

1. **Administrator / Reżyser sesji** (`/admin`, `/admin/director`): przygotowanie sesji, porządek obrad, wybór punktu, start/stop głosowania, obecność, podgląd rzutnika/vMix, zatwierdzanie i publikacja wyników.
2. **Ekran prezentacyjny/rzutnik** (`/display`): herb, numer i nazwa sesji, data i godzina, aktualny punkt, status sesji, temat głosowania, wyniki. Bez elementów sterowania i poufnych informacji.
3. **Panel radnego na Androidzie** (`/councillor`): logowanie, potwierdzenie obecności, dokumenty, bieżący punkt, przyciski **ZA / PRZECIW / WSTRZYMUJĘ SIĘ** i wiarygodne potwierdzenie zapisu głosu.
4. **Panel realizatora i źródła vMix** (`/production`, `/production/vmix/*`): podgląd statusu sesji, preview/program, belki i pełnoekranowe grafiki, automatyka emisji zatwierdzonych wyników, ręczna awaryjna kontrola nakładek; bez uprawnień do zmiany głosów.

Wszystkie widoki pobierają prawdę z **jednego lokalnego serwera** i są aktualizowane w czasie rzeczywistym (np. WebSocket). Żadne krytyczne uprawnienia ani wyniki nie mogą zależeć tylko od stanu frontendowego.

## 4. Administrator / „Reżyser sesji” — najważniejszy interfejs

### 4.1 Układ trzech kolumn

- **Lewa:** porządek obrad, punkt aktywny, drag-and-drop porządku w fazie przygotowania, szybkie „następny/poprzedni”, dokumenty i projekty uchwał.
- **Środkowa:** podgląd rzutnika, podgląd grafiki vMix, temat głosowania, duże sterowanie: rozpocznij sesję, głosowanie start, zamknij, zatwierdź wynik, opublikuj/wyświetl, przerwa, zakończ sesję.
- **Prawa:** 15 radnych, obecność, kworum, połączenia tabletów, liczba głosów zarejestrowanych, ostrzeżenia techniczne i połączenie vMix Bridge.

### 4.2 Nawigacja

Pulpit; Sesje; Porządek obrad; Głosowania; Obecność; Radni; Dokumenty i uchwały; Reżyser sesji; Ekran prezentacyjny; Realizator/vMix; Raporty; Archiwum; Ustawienia; Diagnostyka/Próba generalna.

### 4.3 Pełny zakres

- Nowa sesja: numer, kadencja, data, godzina, miejsce, typ, prowadzący, status `draft/scheduled/live/break/ended`.
- Kopiowanie sesji jako szablonu.
- Tworzenie i edycja punktów i podpunktów, ich kolejności, opisów, dołączanych dokumentów i projektów; odnotowanie zmian w trakcie sesji.
- Import porządku PDF/DOCX/tekst z **ekranem podglądu i ręcznym zatwierdzeniem rozpoznania**.
- Rozpoczęcie sesji, wybór punktu, następny/poprzedni, przerwa, zakończenie.
- Otwarcie i zamknięcie obecności, zarządzanie głosowaniami, zatwierdzenie wyniku.
- Możliwość sterowania tym, co pokazuje rzutnik, niezależnie od grafiki transmisyjnej.
- Ostrzeżenia o braku kworum, braku połączenia i niezgodnym stanie urządzeń.
- Operacje nieodwracalne wymagają potwierdzenia, uprawnień i rejestracji w audycie.

## 5. Rzutnik: osobne okno Windows 11

- Administrator w Windows wybiera **Win + P → Rozszerz**, otwiera `/display` w oddzielnym oknie i przenosi na drugi ekran, potem pełny ekran.
- Pełnoekranowy widok bez przycisków administracyjnych. Wielkie czcionki, kontrast, układ 16:9, tryb Full HD.
- Nagłówek: herb Goliny, „Rada Miejska w Golinie”, numer sesji, data, opcjonalnie zegar.
- Centrum: numer, temat i opis aktualnego punktu, ewentualnie numer uchwały/projektu.
- Dół: liczba obecnych, kworum, status sesji, następny punkt (opcjonalnie).
- Tryby: ekran startowy / aktualny punkt / trwa głosowanie / wyniki / przerwa / koniec sesji.
- Wyniki: status, liczby, imienny wykaz głosów w kolorowych kafelkach, wykres kołowy lub słupkowy.
- Nie ujawniaj cząstkowych indywidualnych wyborów podczas trwania głosowania.

## 6. Radni: Android, PWA

- Responsywna PWA dostępna lokalnie z Chrome; skrót na ekranie głównym, opcjonalny kiosk/MDM.
- Osobne konta, bezpieczne uwierzytelnianie, identyfikacja przypisana do radnego, czytelne stany logowania/połączenia.
- Widok: dane radnego, aktualna sesja i punkt, porządek obrad, dokumenty (PDF), komunikaty, status obecności.
- **Obecność:** jednoznaczne potwierdzenie i godzina zapisania; późne wejście i wcześniejsze wyjście z historią; możliwość uprawnionych korekt z uzasadnieniem.
- **Głos:** ekran z pełnym pytaniem i trzema dużymi przyciskami ZA/PRZECIW/WSTRZYMUJĘ SIĘ; po kliknięciu wyraźne potwierdzenie wyboru i odpowiedź serwera.
- Tylko jedno skutecznie zapisane rozstrzygnięcie w danym głosowaniu na radnego. Ewentualna możliwość zmiany głosu przed zamknięciem musi być osobną, zgodną z procedurą opcją z zachowaniem historii; domyślnie wyłączona do czasu weryfikacji.
- Nie pokazuj „głos zapisany”, dopóki backend nie potwierdzi transakcji.
- Po utracie sieci nie zapisuj pozornych głosów lokalnie i **nigdy** nie przyjmuj opóźnionego głosu po formalnym zamknięciu głosowania.
- Stan „offline” nie oznacza automatycznie „nieobecny”.

## 7. Obecność, kworum, głosowania

### 7.1 Obecność

Status obecny/nieobecny, godziny i historia, odrębnie łączność tabletu. Lista obecności i raport. Kworum licz zgodnie z konfigurowalnym ustawowym składem i właściwymi normami; nie zakładaj, że liczba radnych zawsze wynosi 15.

### 7.2 Cykl głosowania

`DRAFT → OPEN → CLOSED → APPROVED → PUBLISHED` (z kontrolowanymi przypadkami `CANCELLED/ANNULLED` i nowym głosowaniem, jeśli procedura tego wymaga).

- Głosowanie zawiera sesję, punkt obrad, numer, pytanie i temat, załączony projekt, tryb jawny, właściwą regułę większości i kworum.
- Rozpoczęcie wyzwala możliwość głosowania na tabletach oraz komunikat na rzutniku i w panelu realizatora.
- Zapis każdego głosu w transakcji na serwerze i unikalny klucz głosowanie+radny, z mechanizmem idempotencji i audytem.
- Zamknięcie atomowo blokuje nowe głosy. Oddzielnie administrator zatwierdza wynik (po przeglądzie).
- Wyniki: ZA, PRZECIW, WSTRZYMUJĘ SIĘ, BRAK GŁOSU, NIEOBECNI; nazwiska i status każdego radnego; poprawne rozróżnienie braku głosu od nieobecności.
- Reguły zwykłej/bezwzględnej/kwalifikowanej większości i właściwe kworum muszą być jawne, testowane i zatwierdzone przez użytkownika; nie zakładaj, że wszystkie uchwały mają tę samą regułę.
- Po zatwierdzeniu wynik jest niezmiennym rekordem; sprostowanie/unieważnienie/ponowne głosowanie wymaga osobnych jawnych zdarzeń.
- Przy jawnych głosowaniach zapewnij możliwość niezwłocznego publicznego udostępnienia imiennego wykazu zgodnie z prawem. Zweryfikuj obowiązujące przepisy (w tym art. 14 ustawy o samorządzie gminnym), statut i praktykę urzędu przed wdrożeniem.
- Inne tryby głosowań wymagają osobnej analizy prawnej; podstawowym zakresem wdrożenia są jawne głosowania imienne.

## 8. Integracja vMix — wymóg obowiązkowy

**Ostateczny wybór: vMix na osobnym komputerze, grafika pojawia się AUTOMATYCZNIE po zatwierdzeniu wyniku przez administratora.**

### 8.1 Proponowana architektura

- Serwer GOLINA e-SESJA na Windows 11 publikuje podpisane/autoryzowane zdarzenia `SESSION_*`, `AGENDA_CHANGED`, `VOTE_OPENED`, `VOTE_CLOSED`, `VOTE_RESULT_APPROVED`, `BREAK_*`.
- **vMix Bridge** (lokalny agent na komputerze realizatora) utrzymuje autoryzowane połączenie z serwerem, pobiera zdarzenia i wywołuje **oficjalne HTTP API vMix** przez lokalny interfejs vMix na komputerze realizatora.
- Grafiki HTML/CSS dostępne jako lokalne URL do **vMix Web Browser Input**; w przypadku nakładek wersje z przezroczystym tłem.
- Zarówno API, jak i źródła renderowane w vMix muszą być uwierzytelnione/zabezpieczone adekwatnie do lokalnego środowiska. Nie wystawiaj otwartego API vMix do całej sieci radnych.
- Alternatywnie przy braku zgodności Browser Input: wyjście HDMI/capture; NDI tylko opcjonalnie po sprawdzeniu faktycznego wsparcia i wymagań.

### 8.2 Trasy grafik

- `/production` — panel realizatora, read-only wobec danych głosowania.
- `/production/vmix/lower-third` — pasek z sesją i bieżącym punktem.
- `/production/vmix/voting` — głosowanie trwa.
- `/production/vmix/results` — zatwierdzony wynik.
- `/production/vmix/fullscreen` — plansza pełnoekranowa.
- `/production/vmix/agenda` — bieżący porządek.
- `/production/vmix/attendance` — zestawienie obecności.
- `/production/vmix/break` — plansza przerwy.

Format 1920 × 1080, z innymi rozdzielczościami jako opcją; obszary bezpieczne, poprawne polskie litery, kontrast, grafiki z herbem i tytułem; przewidywalne zachowanie po reconnect.

### 8.3 Automatyczne emitowanie wyniku — dokładny algorytm

1. Administrator kończy głosowanie, serwer odrzuca nowe głosy i liczy wynik.
2. Administrator weryfikuje i **zatwierdza** wynik.
3. Serwer transakcyjnie utrwala wersję ostateczną i publikuje **jedno** zdarzenie `VOTE_RESULT_APPROVED` z `sessionId`, `voteId`, `resultVersion`, `eventId`, czasem.
4. Bridge otrzymuje zdarzenie, sprawdza autoryzację, deduplikuje i ustala, czy jest to nadal najnowszy kwalifikujący się wynik.
5. Bridge odświeża dane widoku `/production/vmix/results` i czeka na potwierdzenie gotowości grafiki.
6. Bridge przez oficjalne API vMix włącza skonfigurowany Overlay / odpowiednie źródło — bez dodatkowego klikania realizatora.
7. Grafika z wynikiem jest emitowana przez domyślne **15 sekund** (konfiguracja: 10/15/20/30 sekund lub ręcznie).
8. Bridge wyłącza nakładkę; loguje polecenie, rezultat, błędy i ewentualną interwencję realizatora.

**Nie pokazuj wyniku w transmisji po samym zamknięciu głosowania, lecz dopiero po zatwierdzeniu.** Realizator ma awaryjne **Hide/Override** i tryb ręczny, a także odrębne stany `PREVIEW` i `PROGRAM`, ale nie może zmieniać treści/indywidualnych głosów. W trybie automatycznym `PROGRAM` przełącza Bridge.

Przy restarcie/ponownym połączeniu **nie emituj zaległych starych wyników automatycznie**. Odrzucaj nieaktualne zdarzenia, obserwuj heartbeat i aktualną wersję wyniku.

**Źródło faktów technicznych:** korzystaj z aktualnej oficjalnej dokumentacji vMix dla Web Browser Input, Web Controller/HTTP API i funkcji Overlay. Nie zakładaj konkretnej składni wywołań bez testu na posiadanej wersji vMix.

### 8.4 Grafiki vMix

- Belka dolna: herb/skrót sesji + aktualny punkt i nazwa.
- „TRWA GŁOSOWANIE”: pytanie + liczba oddanych głosów (tylko jeśli skonfigurowano, bez ujawnienia rozkładu).
- „WYNIKI”: status PRZYJĘTO/NIEPRZYJĘTO, ZA/PRZECIW/WSTRZYMUJĘ SIĘ/BRAK GŁOSU/NIEOBECNI, opcjonalny wykres i imienna lista.
- Plansze: początek, przerwa, koniec, porządek obrad, obecność.
- Każdy widok utrzymuje semantyczne etykiety obok kolorów.

## 9. Sieć urzędu i laptop-serwer

- Istniejąca infrastruktura urzędu: wymagany przegląd konfiguracji IT, zasięgu i obciążenia Wi-Fi, izolacji klientów, firewalli, DHCP/DNS, możliwości wydzielonego SSID/VLAN.
- Rekomendacja: laptop-serwer i komputer vMix łączone **Ethernetem** jeśli dostępne; tablety przez Wi-Fi. Zasadę „jedna sieć” spełnia wydzielona komunikacja przez odpowiednie reguły sieciowe.
- Laptop Windows 11: automatyczne uruchamianie backendu i bazy jako usług; wyłączone uśpienie w czasie sesji; zasilanie stałe; zalecany UPS. Brak automatycznych aktualizacji/restarów w godzinach sesji — zgodnie z polityką IT.
- Adresy **wyłącznie przykładowe**, nie konfigurować na sztywno: serwer `192.168.10.10`, vMix PC `192.168.10.20`, router `192.168.10.1`.
- Przykładowa lokalna nazwa DNS: `sesja.golina.lan`. Wymagane ustawienie DNS i certyfikatu **zaufanego przez wszystkie tablety Android**. Nie stosować produkcyjnie niezweryfikowanego HTTPS ani ignorowania ostrzeżeń przeglądarki.
- Serwer przetrwa utratę dostępu do internetu; jeżeli realizator transmituje do platformy zewnętrznej, komputer vMix potrzebuje odpowiednio skonfigurowanego dostępu do internetu.
- Stosuj autoryzację per rola: administrator, operator, radny, realizator, publiczny ekran. Rzutnik i vMix nie otrzymują uprawnień do operacji na głosach.
- Szyfrowane kopie zapasowe poza laptopem, test odzyskania; odrębny dziennik audytowy; ograniczony dostęp do danych osobowych i retencja uzgodniona z urzędem.

## 10. Architektura oprogramowania — propozycja, nie wiążący wybór implementacyjny

Preferuj **TypeScript + React/Next.js + PostgreSQL**, interfejs Tailwind CSS, autoryzowane WebSocket/SSE. Codex może zaproponować inne rozwiązanie, ale musi uzasadnić, jak na Windows 11 powstaną powtarzalne instalacje oraz usługi uruchamiane automatycznie. Możliwa aplikacja spakowana jako usługa/instalator, bez zależności od internetu.

Zasady:
- Serwer autorytatywny dla obecności, aktywnego głosowania i zapisanych głosów.
- Transakcje bazodanowe, unikalne ograniczenia, idempotentne komendy, niezmienność zatwierdzonych wyników.
- Model zdarzeń i dziennik audytowy (`actor`, `action`, `timestamp`, `before/after`, `device`, `eventId`), z zabezpieczeniem przed zwykłą edycją/usunięciem.
- **Nie** używaj localStorage jako jedynej bazy, nie symuluj backendu i nie potwierdzaj fałszywie sukcesu.
- Obsługa wielosesyjności i różnych kadencji, bez kodowania na stałe listy radnych i jednego porządku.
- Głosowania i transmisja izolowane logicznie: awaria Bridge lub vMix nie zatrzymuje głosowania.
- Interfejs powinien działać z klawiaturą i być zgodny z WCAG 2.2 AA w zakresie adekwatnym do serwisu.

### Proponowane encje

`User`, `Role`, `Councillor`, `Term`, `Session`, `AgendaItem`, `Document`, `AttendanceEvent`, `VotingSession`, `Ballot`, `VotingResult`, `VoteApproval`, `DeviceConnection`, `ProductionCue`, `AuditEvent`, `SystemSetting`, `BackupRecord`.

Przewidź indeksy, wersjonowanie wyniku i relacje, migracje schematu, seed z **fikcyjnymi** 15 radnymi dla demo, ale **nie twórz fikcyjnej prawdziwej listy radnych Goliny**.

## 11. Eksport i archiwum

- Po sesji: imienne wyniki każdego głosowania, lista obecności, zestawienie podjętych/niepodjętych uchwał, chronologia zdarzeń, raport techniczny, projekt protokołu.
- PDF, DOCX, CSV. Czytelny branding, numer sesji, daty/godziny, dane identyfikacyjne i status zatwierdzenia.
- Projekt protokołu nie jest automatycznie oficjalnym zatwierdzonym protokołem.
- Archiwum szukające po dacie, numerze sesji, tytule, numerze projektu, radnym i wyniku.
- Możliwość publikacji wyników do BIP/strony urzędu, po uzgodnieniu integracji i uprawnień; jeśli brak internetu podczas obrad, eksport do późniejszej publikacji z zastrzeżeniem obowiązujących terminów.

## 12. Dodatkowe moduły do zaplanowania

Zgłaszanie do dyskusji, kolejka mówców, czasomierz wypowiedzi, wnioski formalne, komunikaty na tablety, wyświetlanie PDF, diagnostyka urządzeń, tryb testowy, przeprowadzanie próbnej sesji, historia operatora. Priorytet niższy niż bezpieczne głosowanie i vMix.

## 13. Widoki i przykładowe endpointy aplikacji

- `/admin`, `/admin/director`, `/admin/sessions`, `/admin/agenda`, `/admin/voting`, `/admin/attendance`, `/admin/councillors`, `/admin/documents`, `/admin/reports`, `/admin/settings`, `/admin/diagnostics`
- `/councillor`
- `/display`
- `/production`, `/production/vmix/lower-third`, `/production/vmix/voting`, `/production/vmix/results`, `/production/vmix/fullscreen`, `/production/vmix/agenda`, `/production/vmix/attendance`, `/production/vmix/break`
- `/results`, `/archive`

Nazwy ścieżek są propozycją kontraktu; zachowaj spójność i dokumentuj rzeczywiste API.

## 14. Przykładowa sesja demonstracyjna (NIE oficjalny porządek)

XXVIII Sesja Rady Miejskiej w Golinie, data testowa 24.09.2026 (widoczna na jednym ze zrzutów; szczegóły wymagają potwierdzenia z oficjalną dokumentacją).

1. Otwarcie sesji i stwierdzenie kworum.
2. Przedstawienie porządku obrad.
3. Przyjęcie porządku obrad.
4. Przyjęcie protokołu poprzedniej sesji.
5. Informacja Burmistrza o działalności międzysesyjnej.
6. Rozpatrzenie petycji — demonstracyjnie „projekt nr 198”, jak na zrzucie.
7. Podjęcie uchwał.
8. Wolne wnioski i informacje.
9. Zakończenie.

Punktów nie uznawaj za rzeczywisty kompletny porządek. Oprogramowanie ma umożliwić administratorowi import i zastąpienie ich prawdziwymi danymi.

## 15. Wygląd / inspiracje

- Oficjalny, stonowany wygląd: biel, granat, zielone akcenty; wysoki kontrast.
- Kolory statusów: ZA zielony, PRZECIW czerwony, WSTRZYMANIE żółty, BRAK GŁOSU granatowy, NIEOBECNY szary. Zawsze używaj również tekstu/ikon.
- Herb ze **zweryfikowanego, dostarczonego przez urząd** pliku — nie generuj go na podstawie screenshotów.
- Rzutnik i vMix: tekst widoczny z daleka, układ 16:9, wersje przezroczystych belek i pełnych plansz; test poprawnego renderowania polskich liter.
- Wybór jasny/ciemny dla administratora. Intuicyjne duże kontrolki dla radnego.

## 16. Awaryjność i bezpieczeństwo

- Przy utracie sieci przez tablet pokaż offline; nie przyjmuj wstecz zaległych głosów po zamknięciu.
- Przy utracie serwera głosowanie elektroniczne zostaje wstrzymane — nie wolno symulować sukcesu.
- Przy utracie vMix: głosowanie działa niezależnie. Bridge sygnalizuje błąd i nie wznawia historycznych cue automatycznie.
- Przy restarcie przeglądarki administratora stan wynika z serwera/bazy, nie ze strony.
- Procedura awaryjnego jawnego głosowania imiennego zgodna z wymaganiami prawnymi, dokumentująca powód awarii i ręcznie odnotowany wynik — szczegóły zatwierdza obsługa prawna urzędu.
- MFA dla administratorów, role i uprawnienia po stronie backendu, HTTPS, odporność na powtórzenia żądań, ochrona przed CSRF/XSS, zasady retencji RODO, kopie poza laptopem i test odtwarzania.
- Nie stosuj nakładki vMix jako źródła prawdy o wyniku; jest odbiorcą zatwierdzonych danych.

## 17. Kolejność implementacji dla Codexa

**Faza 0: repozytorium i projekt** — struktura, decyzje technologiczne, skrypty startowe dla Windows 11, dokumentacja, struktura konfiguracji, migracje i seed testowy.

**Faza 1: pionowy prototyp end-to-end** — zalogowanie administratora, sesja i punkt, rejestracja obecności Android, otwarcie głosowania, zapis 15 głosów, zamknięcie, obliczenie i zatwierdzenie, ekran rzutnika, graficzny endpoint wyników, demonstracja zdarzenia dla Bridge.

**Faza 2: prawdziwe vMix Bridge** — konfiguracja zgodna z wersją vMix, Web Browser Input i overlay przez oficjalne API, automatyczne 15 sekund oraz manual override, test na realnym sprzęcie.

**Faza 3: pełny Reżyser sesji** — porządek obrad, dokumenty, import, kontrola urządzeń, prezentacje, przerwy.

**Faza 4: raporty i archiwum** — PDF/DOCX/CSV, audyt, publikacja i wyszukiwanie.

**Faza 5: bezpieczeństwo i odbiór** — testy wieloużytkownikowe, awaryjne, uprawnienia, poprawność matematyczna i prawna, instrukcje i instalator.

Na koniec każdej fazy: pokaż zrealizowane moduły, komendy uruchomienia, wyniki testów i otwarte kwestie; nie ukrywaj brakujących funkcji.

## 18. Testy akceptacyjne (obowiązkowe)

1. 15 tabletów Android oddaje głosy równocześnie; żaden nie ginie, żaden nie dubluje się.
2. Dwa równoległe kliknięcia tego samego radnego nie skutkują dwiema kartami głosu.
3. Zamknięcie głosowania atomowo uniemożliwia przyjęcie kolejnych głosów.
4. BRAK GŁOSU ≠ NIEOBECNY; utrata Wi-Fi ≠ opuszczenie sesji.
5. Kworum i reguły większości mają testy dla sytuacji brzegowych.
6. Administrator może pracować na pierwszym ekranie Windows, rzutnik pokazuje `/display` na drugim.
7. Zmiana punktu dociera jednocześnie na tablet, rzutnik i do realizatora.
8. vMix **nie** pokazuje wyniku przed zatwierdzeniem.
9. Po zatwierdzeniu dokładnie jeden aktualny wynik pokazuje się automatycznie w vMix, przez 15 s domyślnie.
10. Restart Bridge nie prowadzi do emisji starego wyniku.
11. Utrata vMix nie blokuje zapisu głosów i raportów.
12. Utrata internetu nie blokuje pracy lokalnej.
13. Restart przeglądarki administratora nie usuwa danych ani aktywnej sesji.
14. Próba odtworzenia bazy z kopii zapasowej kończy się sukcesem.
15. Radny nie może wywołać administracyjnych endpointów i odczytać cudzych nieopublikowanych głosów.
16. Eksport PDF/DOCX/CSV zawiera kompletną imienną listę i status zatwierdzenia.
17. Skan testowy bezpieczeństwa, weryfikacja HTTPS z Androida, logowanie i niezmienność audytu.
18. Pełna próba generalna z komputerem rzeczywiście uruchamiającym vMix.

## 19. Instalacja / wdrożenie — kolejność operacyjna

1. **IT urzędu:** uzgodnienie VLAN/SSID, test zasięgu, DHCP, zapór, DNS i certyfikatów; potwierdzenie, że serwer Windows i vMix PC mogą się komunikować.
2. **Laptop Windows 11:** instalacja środowiska uruchomieniowego, serwera, PostgreSQL, plików konfiguracyjnych, usług automatycznego startu, HTTPS i backupu.
3. **Android:** przyłączenie tabletów, zaufanie certyfikatu, konta radnych, tryb PWA/kiosk, test potwierdzania głosów.
4. **Rzutnik:** Windows „Rozszerz”, osobne okno `/display`, pełny ekran 1920 × 1080.
5. **Komputer vMix:** skonfigurowanie scen/Overlay, źródeł Web Browser, instalacja Bridge i jego danych dostępowych, test automatycznej emisji i chowania.
6. **Próba generalna:** 15 tabletów, co najmniej kilka głosowań z różnymi rozkładami głosów, kworum, utrata Wi-Fi i symulacja awarii.
7. **Odbiór:** dokumentacja, szkolenia, podpis protokołu testów, formalne zatwierdzenie prawne/organizacyjne i dopiero wtedy start produkcyjny.

Konfiguracja dostępów i portów ma powstać po audycie lokalnej sieci. **Nie ustawiaj przykładowych adresów IP jako stałych wartości w kodzie.**

## 20. Lista kontrolna każdej sesji

- [ ] Laptop-serwer i baza uruchomione, usługi zdrowe.
- [ ] Kopia zapasowa utworzona i nośnik dostępny.
- [ ] Sieć urzędu i lokalny DNS/HTTPS działają.
- [ ] 15 tabletów łączy się z serwerem.
- [ ] Konta i obecność radnych sprawdzone.
- [ ] Porządek obrad i dokumenty zweryfikowane.
- [ ] Rzutnik wyświetla właściwy punkt.
- [ ] vMix Bridge połączony, overlay testowy działa.
- [ ] Głosowanie testowe i wynik sprawdzone.
- [ ] Procedura awaryjna i kontakt do IT przygotowane.

## 21. Otwarte kwestie do zatwierdzenia — nie zgadywać

- Oficjalny pełny porządek obrad, treści uchwał i autoryzowane dokumenty.
- Oficjalny plik herbu i zasady identyfikacji wizualnej.
- Faktyczny skład rady, kadencja i lista radnych (źródło urzędowe).
- Dokładna wersja vMix, posiadana licencja i konfiguracja scen oraz komputera realizatora.
- Parametry laptopa Windows 11 (CPU, RAM, dysk, zasilanie), jego dostępne porty LAN/HDMI, uprawnienia admin.
- Konfiguracja sieci urzędu: adresacja, VLAN, DNS, firewall, certyfikaty, udostępnianie internetu na PC realizatora.
- Praktyka prawna w kwestii większości, kworum, zmiany oddanego głosu i awaryjnego głosowania imiennego.
- Rzeczywista metoda publikacji do BIP/strony urzędu, polityka retencji i kopii bezpieczeństwa.
- Kto zatwierdza wyniki i kto może anulować głosowanie; przebieg autoryzacji w urzędzie.
- Czy grafikę zatwierdzonego wyniku w vMix pokazujemy jako nakładkę na kamerę czy jako pełnoekranową planszę (możliwa konfiguracja obu wariantów; domyślnie nakładka).

## 22. Oczekiwane pliki i artefakty od Codexa

- Działające repozytorium frontend+backend+PWA+vMix Bridge.
- `README.md` (lokalne uruchomienie demonstracyjne), `ARCHITECTURE.md`, `SECURITY.md`, `DEPLOY_WINDOWS_11.md`, `VMIX_SETUP.md`, `ANDROID_SETUP.md`, `RUNBOOK_SESSION.md`, `BACKUP_RESTORE.md`, `TEST_PLAN.md`.
- Przykładowy `.env.example` bez sekretów, migracje bazy, seed danych demonstracyjnych.
- Automatyczne testy bazodanowe, API, głosowań, uprawnień i symulacji Bridge; instrukcja testu end-to-end na rzeczywistym vMix.
- Instrukcja pakowania/instalatora Windows i konfiguracji usług na starcie systemu.
- Lista jawnych ograniczeń MVP i wymagań do odbioru produkcyjnego.

---

**Najważniejsza reguła:** głosowanie jest operacją urzędową i musi być prawidłowo utrwalone na serwerze. Rzutnik i vMix to niezależne odbiorniki prezentacyjne. **Automatyczne wyświetlenie w vMix następuje dopiero po zatwierdzeniu wyniku**, a awaria transmisji nie może zmienić lub utracić głosu.
