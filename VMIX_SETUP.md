# vMix Bridge — adapter demonstracyjny

Bridge uruchamiaj **na osobnym komputerze vMix**. Oficjalne API vMix powinno być dostępne wyłącznie lokalnie, domyślnie na loopback i porcie 8088. Nie otwieraj go tabletom. Host inny niż loopback jest odrzucany przez CLI Bridge.

## Przygotowanie

1. Zweryfikuj dokładną wersję/licencję vMix i działanie Web Browser Input. Źródła do sprawdzenia: [HTTP API](https://www.vmix.com/help29/DeveloperAPI.html), [funkcje skrótów](https://www.vmix.com/help29/ShortcutFunctionReference.html), [Web Browser Input](https://www.vmix.com/help29/WebBrowser.html). W tej chmurze próba pobrania dokumentacji otrzymała proxy HTTP 403. Nie wykonano testu na rzeczywistym vMix; poniższy kontrakt nie jest zatwierdzeniem kompatybilności konkretnej wersji.
2. Dodaj Browser Input 1920×1080 ze źródłem `/production/vmix/results` na serwerze sesji. Przez interakcję z Browser Input zaloguj konto `graphics`. Nie umieszczaj hasła w adresie. Zaufany certyfikat musi działać także w przeglądarce vMix.
3. Odczytaj GUID Input. Sprawdź kanał Overlay 1–4, przezroczystość tła i obszary bezpieczne. Grafika potwierdza gotową wersję po dwóch klatkach przeglądarki; nie oznacza to pomiaru fizycznego sygnału.
4. Zainstaluj Node 24 i pliki aplikacji na PC realizatora, wykonaj `npm ci`. Ustaw lokalny `.env` według `.env.example`: SERVER_URL (zaufane HTTPS dla LAN), BRIDGE_USERNAME, BRIDGE_PASSWORD, VMIX_URL (loopback), VMIX_INPUT (GUID), VMIX_OVERLAY (1–4), OVERLAY_SECONDS (10/15/20/30, domyślnie 15), BRIDGE_STATE (trwały plik w katalogu z prawem zapisu). Nie kopiuj wspólnego hasła demo do docelowego wdrożenia.
5. `npm run bridge`. W panelu `/production` sprawdź heartbeat. Najpierw wykonaj próbę poza emisją publiczną.

Adapter wysyła lokalnie `GET /api/?Function=OverlayInput1In&Input=<GUID>` oraz `GET /api/?Function=OverlayInput1Out` (numer konfigurowalny). Wykorzystuje timeouty i wymaga sukcesu HTTP; to **nie jest niezależne potwierdzenie obrazu PROGRAM**. Przed wdrożeniem sprawdź składnię i odpowiedzi na posiadanej wersji.

## Reguły automatyki

Zatwierdzenie wyniku transakcyjnie zapisuje wynik i eventId. Bridge odpytywany co 500 ms wybiera tylko najnowszy aktualny event, młodszy niż 30 s. Czeka na zgodną wersję grafiki; utrwala eventId przed komendą, włącza Overlay, po 15 s wyłącza. Połączenie startuje od aktualnego kursora i wyłączenia nakładki, nie odtwarza historii. Restart, utrata autoryzacji lub timeout powodują ponowną synchronizację bez odtwarzania.

Tryb MANUAL i HIDE zwiększają epokę sterowania i porzucają oczekujące cue. MANUAL oznacza sterowanie lokalnie w vMix; panel nie ma jeszcze ręcznego przycisku SHOW. HIDE zostaje wykonane przez działający Bridge przy następnym odpytywaniu, więc przy jego awarii ukryj grafikę lokalnie w vMix. „Co najwyżej raz” może pominąć emisję przy niejednoznacznym timeout; nie obiecujemy „dokładnie raz” na sprzęcie.

Bieżący adapter jest single-instance: uruchom **jedną** instancję Bridge dla kanału. Nie ma rozproszonej dzierżawy chroniącej przed dwoma Bridge. Po restarcie sesja Browser Input i Bridge może wymagać ponownego logowania. Błędy vMix nie blokują głosowania ani raportów.

Dostępne ścieżki: results, lower-third, voting, fullscreen, agenda, attendance, break pod `/production/vmix/`. Są wariantami wspólnego renderera, nie gotowym zestawem scen GT/NDI. Fallback HDMI/capture i dokładne style pod wersję vMix wymagają odbioru.
