# Weryfikacja prototypu

## Automatyzacja

`npm run build`: TypeScript (serwer, interfejs, Bridge i testy) oraz bundle React. `npm test`: rzeczywiste SQLite/HTTP, bez zewnętrznych usług. `npm run test:e2e`: Chromium i oddzielna baza w pamięci. Dane testowe nie trafiają do bazy demonstracyjnej.

- 15 równoległych klientów HTTP, po jednym trwałym głosie; identyczne ponowienie idempotentne, inna komenda z tym samym kluczem odrzucona.
- Dwa równoczesne pierwsze kliknięcia: tylko jeden głos; wyścig close/ballot ma poprawne uporządkowanie, nowy głos po close odrzucony.
- Brak uprawnień radnego/realizatora do admin API, CSRF, brak anonimowego odczytu stanu, ukryte cudze niezatwierdzone głosy.
- Kworum i progi zwykłej/bezwzględnej/2/3, remis, zero głosów, osobne BRAK GŁOSU i NIEOBECNY, brak uprawnień nieobecnego.
- Jeden event zatwierdzenia, niezmienność wyniku/głosu/audytu, trwałość sesji po ponownym logowaniu i odtworzenie online backup.
- Bridge: brak historycznej emisji po starcie, handshake gotowości, deduplikacja, domyślne 15 s w wirtualnym zegarze, odrzucenie starego wyniku, MANUAL/HIDE, timeout.
- CLI Bridge z rzeczywistym serwerem sesji i **symulatorem HTTP vMix**: parametry Function/Input, PROGRAM, HIDE i awaria vMix bez blokady następnego głosowania.
- Chromium: logowanie, rozpoczęcie, obecność, głosowanie dotykowego panelu, zatwierdzenie, rzutnik, grafika, odświeżenie, CSV i mobilna szerokość 390 px.

## Niewykonane testy sprzętowe / odbiór

15 fizycznych Androidów, realny vMix i zgodność wersji, Windows 11/usługi/HDMI/Full HD, utrata zasilania i odzyskanie po awarii, legalne reguły większości i procedury korekty, niezależny skan bezpieczeństwa, MFA, TLS na tabletach, WCAG 2.2 AA, instalowalność PWA/MDM, sieć VLAN i brak internetu, kopia zaszyfrowana poza laptopem, PDF/DOCX/import/BIP. Testy symulacyjne nie stanowią zaliczenia tych punktów.
