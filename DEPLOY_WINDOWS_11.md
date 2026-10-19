# Windows 11 — uruchomienie demonstracyjne

1. Zainstaluj Node.js **24 LTS** z podpisanego instalatora oficjalnego dystrybutora; sprawdź `node --version`. Na laptopie musi być dostępne lokalne miejsce na bazę i uprawnienia do katalogu aplikacji.
2. W PowerShell przejdź do checkoutu i wykonaj `npm ci`, `npm run build`, `npm run demo:setup`, `npm start`.
3. Odczytaj wygenerowane hasło z lokalnego `.env` i użyj konta `admin`. Pliku nie przesyłaj do Git. Zmiana DEMO_PASSWORD po seed nie zmienia istniejących haseł.
4. Skonfiguruj urządzenia dopiero po przygotowaniu HTTPS i sieci przez IT. Domyślny serwer na loopback jest dostępny tylko na laptopie. Do LAN użyj zaufanego reverse proxy, zachowującego Host i SSE; nie wystawiaj bezpośrednio HTTP do tabletów.
5. Rzutnik: **Win+P → Rozszerz**, oddzielne okno/profil z kontem `display`, ścieżka `/display`, przenieś na drugi ekran i włącz pełny ekran. Testuj 1920×1080 i czytelność polskich liter.
6. Laptop i komputer vMix preferencyjnie Ethernet, tablety przez zatwierdzony Wi-Fi. Nie zakładaj przykładowych adresów IP i nie używaj sieci gościnnej z izolacją klientów.

## Usługi / instalator — następny etap

Repozytorium nie zawiera gotowego instalatora ani zarejestrowanej usługi Windows. Docelowo IT musi wybrać i zweryfikować podpisany wrapper usługi (np. WinSW), uruchomienie przez pełną ścieżkę Node, stały katalog roboczy, dedykowane konto bez uprawnień administratora, ACL do `data` i `.env`, restart po awarii oraz rotację logów. Bridge instaluje się osobno na PC realizatora. Nie deklarujemy testu Windows w środowisku Linux.

Przed publikacją pakietu należy przygotować wersjonowane artefakty, offline instalator Node/dependencies, kontrolę podpisów/sum, migracje istniejącej bazy, rollback i upgrade zachowujący dane. Aktualny ZIP checkoutu z zależnościami nie jest instalatorem. Uzgodnij plan aktualizacji, brak uśpienia podczas sesji, zasilanie/UPS i kopie poza laptopem z IT.
