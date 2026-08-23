# Настройка Gmail API — готовые значения для вставки

Релизный ключ уже сгенерирован и лежит в репозитории: `keys/tempgmail-release.jks`.
Осталось только зайти в Google Cloud Console **под своим Google-аккаунтом** и
вставить готовые значения ниже (все поля уже заполнены — просто копируйте).

## Шаг 1. Создайте проект

Откройте <https://console.cloud.google.com/projectcreate> → имя: `temp-gmail-app` →
«Create». Автоматизировать можно так (в терминале, один раз
`gcloud auth login`):

```bash
gcloud projects create temp-gmail-app-$(date +%s) --name="Temp Gmail"
gcloud services enable gmail.googleapis.com --project=<ID_ПРОЕКТА>
```

## Шаг 2. Включите Gmail API

<https://console.developers.google.com/apis/api/gmail.googleapis.com/overview>
→ выберите проект → «Enable». (Или `gcloud services enable` выше.)

## Шаг 3. OAuth consent screen

<https://console.cloud.google.com/apis/credentials/consent>

- User Type: **External**
- App name: `Temp Gmail`
- User support email: *ваша почта*
- Developer contact: *ваша почта*
- **Scopes → Add or remove scopes** — вставьте обе строки:

```
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/gmail.modify
```

- **Test users**: добавьте свой Gmail-адрес (обязательно! иначе войти не получится,
  пока приложение не верифицировано Google).

## Шаг 4. OAuth Client ID (Android)

<https://console.cloud.google.com/apis/credentials/oauthclient> → Application type
**Android**, и вставьте:

| Поле | Значение |
|---|---|
| Name | `Temp Gmail Android` |
| Package name | `com.tempgmail.app` |
| SHA-1 certificate fingerprint | `76:1D:6A:9B:02:D8:3B:FA:51:6E:D3:0B:BE:48:27:53:DF:97:6C:78` |

> 💡 **Важно**: этот SHA-1 соответствует ключу `keys/tempgmail-release.jks` из
> репозитория. Если будете регистрировать **debug**-сборку (из Android Studio на
> вашем ПК), добавьте второй OAuth-клиент с SHA-1 вашего debug-ключа:
>
> ```bash
> keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1
> ```
>
> Именно поэтому проще всего: **собрать release APK ключом из репозитория**
> (он уже прописан в `app/build.gradle.kts` → `signingConfigs.release`)
> и использовать один зарегистрированный SHA-1 для всех установок.
> Команда: `./gradlew assembleRelease` — APK появится в `app/build/outputs/apk/release/`.

## Шаг 5. Проверка

1. Установите release APK на телефон.
2. «Войти через Google» → выберите аккаунт из Test users → согласие
   `Temp Gmail хочет: читать/изменять настройки и почту…` → принять.
3. Сгенерируйте адрес → «Создать фильтр» → выберите действие — фильтр появится
   в Gmail: <https://mail.google.com/mail/u/0/#settings/filters>

## О верификации Google (честно)

Scope `gmail.modify` — *restricted*. Без верификации:
- работают только аккаунты из списка Test users (до 100 шт.);
- экран согласия показывает предупреждение «app isn't verified» — жмём
  «Advanced → Go to Temp Gmail (unsafe)». Это нормально для личного использования.

Для публичного релиза в Google Play потребуется
[верификация OAuth-приложения](https://support.google.com/cloud/answer/9110914) —
подготовьте privacy policy URL (в приложении пункт «Политика конфиденциальности»
под него заложен) и короткое demo-видео.

## ⚠️ Про ключ

`keys/tempgmail-release.jks` закоммичен в этот (приватный) репозиторий с паролем
`TempGmail2025!` — удобно для личного использования и он соответствует SHA-1 выше.
**Перед публичной публикацией приложения** сгенерируйте НОВЫЙ ключ со своим
паролем, обновите отпечаток в Console и удалите старый ключ из репозитория:

```bash
keytool -genkeypair -keystore my-release.jks -alias myapp -keyalg RSA -keysize 2048 -validity 10950
keytool -list -v -keystore my-release.jks | grep SHA1
```
