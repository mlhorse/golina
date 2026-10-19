# Android — próba panelu radnego

Wymagany Chrome, zatwierdzone LAN/Wi-Fi bez izolacji klientów oraz zaufany lokalny DNS i HTTPS przygotowane przez IT. Nie pomijaj ostrzeżeń TLS. Nie wprowadzaj przykładowych adresów IP na stałe.

Otwórz `/councillor` na serwerze laptopa, zaloguj konto przypisane do radnego i potwierdź obecność. Przetestuj dotykowe ZA/PRZECIW/WSTRZYMUJĘ SIĘ i komunikat potwierdzenia serwera. W demo są tylko fikcyjne konta radny01–radny15. Urzędowe konta, indywidualne hasła i konfiguracja składu są pracą następnego etapu.

Manifest PWA umożliwia otwarcie w trybie standalone w zgodnej przeglądarce. Service worker przechowuje wyłącznie ogólny komunikat offline, nie odpowiedzi API ani głosy. Pełna instalowalność na modelach urzędu (w tym wymagania ikon PNG i polityki Chrome/MDM) wymaga odbioru na sprzęcie. Nie deklarujemy, że test emulacji Chromium zastępuje Androida.

Sprawdź: blokadę po zamknięciu, restart Chrome, utratę Wi-Fi przed wysłaniem i po wysłaniu bez odpowiedzi, ponowne połączenie i odczyt własnego głosu. Offline nie zmienia obecności. Nie utrzymujemy kolejki głosów do późniejszej wysyłki. Utrata serwera oznacza przerwanie elektronicznej procedury. Kiosk/MDM i usuwanie kont z wycofanych urządzeń uzgodnij z IT.
