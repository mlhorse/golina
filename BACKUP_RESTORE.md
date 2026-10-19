# Kopie i odtwarzanie

Spójna kopia aktywnej bazy (z katalogu repozytorium):

```sh
npm run backup -- ./data/backup-2026-10-19.sqlite
```

Używany jest mechanizm online backup SQLite, obejmujący zatwierdzone transakcje także przy WAL. Cel nie może istnieć. Kopia zawiera dane osobowe, hashe haseł i aktywne sesje — traktuj ją jako poufną. Skrypt **nie szyfruje** pliku, nie wysyła go poza laptop i nie wdraża retencji. IT musi zapewnić szyfrowany nośnik, ACL, retencję i kopię poza laptopem. Nie stosuj do działającej bazy zwykłego kopiowania samego pliku `.sqlite`.

## Odtworzenie demonstracyjne

1. Zachowaj oryginalną bazę i pliki WAL/SHM, zatrzymaj serwer. Nie nadpisuj jedynej kopii.
2. Umieść kopię pod nową lokalną ścieżką i ustaw DATABASE_PATH na tę ścieżkę.
3. Uruchom serwer; sprawdź `/api/health`, zaloguj i porównaj liczby głosów oraz zatwierdzone imienne wyniki z eksportem. Weryfikację `PRAGMA integrity_check` i kompletności kopii wykonuje także test API.
4. Po incydencie unieważnij odtworzone sesje administracyjnie (brak panelu w MVP) i zmień dane dostępowe w docelowej implementacji. Nie używaj backupu do cofnięcia prawnie zatwierdzonego wyniku bez formalnej procedury.

Automatyczny test kopii otwiera ją jako drugą bazę, sprawdza integralność i 15 zapisanych głosów. Odtworzenie po awarii Windows, szyfrowanie i odtworzenie z nośnika poza laptopem wymagają osobnej próby odbiorowej.
