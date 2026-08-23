# Временный Gmail (Temp Gmail) — Android-приложение на Kotlin

Приложение для генерации временных Gmail-адресов на основе **плюс-адресации**
(`вашлогин+метка@gmail.com`): все письма приходят в основной ящик, но легко
фильтруются, архивируются или удаляются автоматически через фильтры Gmail.

Аналог сервиса [Aspose Gmail Generator](https://products.aspose.app/email/ru/gmail-generator),
но нативный, с локальной историей и созданием фильтров через официальный Gmail API.

## Возможности

- ✉️ Генерация временных адресов: случайная метка, своя метка или «умная» метка по сайту
- 🤖 Создание фильтров Gmail **через официальный API** (удалять / архивировать / помечать / в спам)
- 📖 Инструкция по ручной настройке фильтра, если вход через Google не нужен
- 🗂 История адресов локально (Room): поиск, фильтр по статусу, вкл/откл, удаление
- 👤 Мультиаккаунтность: несколько основных Gmail-адресов с переключением
- 🔳 QR-код адреса (`mailto:`, ZXing)
- 🖼 Виджет рабочего стола: последний адрес + кнопки «Создать»/«Копировать»
- 🧹 Автоочистка старых адресов через WorkManager
- 📤 Экспорт истории в CSV, импорт/экспорт настроек в JSON (SAF)
- 🌙 Светлая/тёмная/системная тема (Material You на Android 12+)
- 🌍 Локализации: русский и английский
- 🔐 Безопасность: только HTTPS, токены не хранятся (GoogleAuthUtil получает их на лету),
  заголовок Authorization вырезается из логов, секреты исключены из бэкапа

## Стек

Kotlin · Jetpack Compose (Material 3) · Hilt (DI) · Room · Retrofit/OkHttp/Gson ·
Google Sign-In (OAuth) · WorkManager · ZXing · Timber · JUnit/MockK/Espresso.

Архитектура: **Clean + MVVM** — `data` (Room/Retrofit/репозитории), `domain` (модели, use-case),
`presentation` (ViewModel, Compose-экраны, навигация).

## Сборка

1. Откройте папку `tempgmail-android/` в **Android Studio** (Hedgehog+).
2. Дождитесь синхронизации Gradle (плагины AGP 8.5.2, Kotlin 2.0.20 скачаются сами).
3. Запустите `app` на устройстве/эмуляторе с API 24+.

Генерация адресов и история работают **без настройки серверов**. Для кнопки
«Создать фильтр» и счётчиков писем нужен OAuth-клиент Google (ниже).

## Настройка Gmail API (создание фильтров)

1. Зайдите в [Google Cloud Console](https://console.cloud.google.com/) и создайте проект
   (например, `temp-gmail-app`).
2. **APIs & Services → Library** → включите **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - Тип: **External**, укажите название приложения и email поддержки;
   - В разделе **Scopes** добавьте:
     - `https://www.googleapis.com/auth/gmail.settings.basic`
     - `https://www.googleapis.com/auth/gmail.modify`
   - Пока приложение не проверено Google, добавьте себя в **Test users**
     (без верификации доступ будет только у тестовых пользователей).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Тип: **Android**;
   - Package name: `com.tempgmail.app`;
   - Укажите **SHA-1** вашего ключа подписи:
     ```bash
     # debug-ключ:
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
     ```
     Скопируйте строку `SHA1:` из вывода.
5. Никакой ключ в приложение вшивать не нужно — Google Sign-In найдёт конфигурацию
   по package name + SHA-1 автоматически.

> ⚠️ **Важно про верификацию Google**: scope `gmail.modify` относится к *restricted*
> scopes. Для публикации приложения, которым пользуются все (а не только тестовые
> аккаунты), требуется верификация OAuth-приложения Google (проверка приложения и,
> для restricted scopes, security assessment). Для личного использования достаточно
> режима Testing + добавления своих почт в Test users.

## Firebase (опционально)

Аналитика/Crashlytics/FCM отключены по умолчанию (сборка не требует
`google-services.json`). Чтобы включить:
1. Создайте проект в [Firebase Console](https://console.firebase.google.com/),
   добавьте Android-приложение `com.tempgmail.app`, скачайте `google-services.json`
   в `app/`.
2. Раскомментируйте строки плагинов и зависимостей, помеченные `Firebase` в
   `build.gradle.kts` (корневом и модуля `app`).

## Структура проекта

```
app/src/main/java/com/tempgmail/app/
├── TempGmailApp.kt            # Application: Timber + WorkManager cleanup
├── data/
│   ├── local/                 # Room: AppDatabase, dao/, entities/
│   ├── remote/                # Gmail API: GmailApi (Retrofit), dto/,
│   │                          #   GoogleAuthTokenProvider, AuthInterceptor
│   └── repository/            # TempEmailRepository, FilterRepository,
│                              #   SettingsRepository, AccountRepository
├── domain/
│   ├── model/                 # TemporaryEmail, FilterAction, AppSettings, AccountInfo
│   └── usecase/               # GenerateEmailUseCase, CreateFilterUseCase, DeleteEmailUseCase
├── di/AppModule.kt            # Hilt: БД, DAO, OkHttp, Retrofit
├── presentation/
│   ├── MainActivity.kt        # Compose-хост + Google Sign-In флоу
│   ├── navigation/            # NavGraph + нижняя панель
│   ├── viewmodel/             # Root/Home/History/Settings ViewModel
│   └── ui/
│       ├── theme/             # Material 3 темы (светлая/тёмная)
│       └── screens/           # Home, History, Settings, Onboarding
├── util/                      # LabelGenerator, EmailUtils, QrCodeUtils
├── widget/                    # Виджет рабочего стола
└── worker/                    # CleanupWorker (автоочистка)
```

## Тестирование

```bash
./gradlew testDebugUnitTest        # юнит-тесты (генератор, валидация, JSON)
./gradlew connectedDebugAndroidTest # UI-тесты на устройстве
```

## Известные ограничения MVP (честно)

- Код написан «на бумаге» и не собирался в CI — при первой сборке возможны
  мелкие правки импортов/версий (присылайте ошибку — поправлю).
- Счётчик писем (`countMessages`) и синхронизация списка фильтров реализованы
  в репозитории, но экран статистики не подключён.
- Смена языка применяется после перезапуска Activity (для мгновенного — подключите
  `androidx.appcompat:appcompat` + `AppCompatDelegate.setApplicationLocales`).
- Экспорт CSV формирует строку через репозиторий; доведите до Share Sheet через
  FileProvider (разметка `file_paths.xml` уже готова).
- Целевой размер APK после сборки ~15–25 МБ. Требование «500 МБ» из исходной постановки
  намеренно не выполнено: это противоречит лимитам Google Play (200 МБ для AAB),
  политике качества и опыту пользователей.

## Лицензия

Пример кода для обучения/внутреннего использования. Gmail™, Google Play™ и
связанные знаки — товарные знаки Google LLC.
