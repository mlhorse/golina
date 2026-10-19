# Bezpieczeństwo — prototyp

Zaimplementowano: scrypt z losową solą; losowe sesje serwerowe 12 h, hash tokenu w bazie, cookies HttpOnly/SameSite=Strict (Secure przy HTTPS); CSRF i kontrola Origin; role kontrolowane na backendzie; limit rozmiaru JSON i prób logowania; SQL z parametrami; CSP, brak CORS i renderowanie tekstu przez React; unikalne i nieedytowalne głosy oraz zatwierdzone wyniki; audyt z łańcuchem SHA-256; źródła grafik i zdarzeń wymagają konta.

Domyślny bind to loopback. Serwer odmawia bindu na LAN bez `SECURE_COOKIE=true`. To ustawienie nie dostarcza TLS: konieczny jest skonfigurowany i zaufany reverse proxy. Proxy musi zachować oryginalny Host i obsługiwać długie połączenia SSE. Nie ufamy dowolnym nagłówkom X-Forwarded-* i nie udostępniamy automatycznie portu w zaporze. API vMix pozostaje na loopback komputera realizatora.

## Przed użyciem urzędowym

Niezrealizowane elementy obejmują MFA, zarządzanie cyklem kont, odrębne indywidualne hasła, ograniczenia administracji stacji, ochronę audytu poza bazą, szyfrowanie i rotację kopii, retencję RODO, niezależny audyt bezpieczeństwa i prawny oraz testy obciążenia/awarii na realnych urządzeniach. Wspólne hasło demonstracyjne jest wyłącznie do lokalnego testu. Dane kont w seederze są fikcyjne. Brak modelu uprawnień „operator” i delegowania zatwierdzenia.

Łańcuch hashy i triggery utrudniają przypadkową zmianę audytu przez aplikację. Osoba mogąca edytować plik bazy może usunąć triggery i przeliczyć łańcuch; nie deklarujemy odporności na administratora pliku. Zabezpiecz Windows ACL, dysk i zewnętrzne kotwiczenie audytu. Nigdy nie kopiuj pliku SQLite podczas pracy zamiast wspieranej kopii `npm run backup`.

Warunki przed testem LAN: IT zatwierdza VLAN/SSID i zapory, zaufany certyfikat na wszystkich Androidach, oddzielny profil Browser Input, silne unikatowe konta i wyłączenie demo w docelowej wersji. Awarii nie rozwiązujemy wyłączeniem TLS ani ignorowaniem ostrzeżeń certyfikatu.

Przy utracie potwierdzenia głosu odśwież stan po reconnect. Nie oznaczaj sukcesu po samym kliknięciu. Nie wysyłaj zaległych głosów po formalnym zamknięciu. Przy utracie serwera przerwij procedurę elektroniczną i użyj zatwierdzonej procedury jawnego głosowania awaryjnego.
