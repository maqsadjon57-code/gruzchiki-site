#!/usr/bin/env bash
# Сборка APK «Генератор Gmail» (WebView-обертка официального веб-приложения Aspose).
#
# Исходники приложения написаны на smali (формат Dalvik-байткода),
# поэтому для сборки НЕ нужны Android Studio / JDK с javac.
#
# Инструменты ищутся в таком порядке:
#   1. каталог build-tools рядом со скриптом (распакованный архив build-tools.tar.gz)
#   2. каталог из переменной окружения TOOLS_DIR
#
# Структура каталога инструментов:
#   build-tools/jre/            JRE (java, keytool) — для запуска apktool/apksigner
#   build-tools/apktool.jar     Apktool 2.9.3 — сборка APK из smali + ресурсов
#   build-tools/apksigner.jar   apksigner 0.9 — подпись APK (схемы v2/v3)
#   build-tools/aapt2           aapt2 (Linux x86_64) — компиляция ресурсов
#   build-tools/aapt            aapt (Linux x86_64) — dump badging и т.п. (необязателен)
#   build-tools/framework/1.apk Android framework (API 24) для разрешения android:*-атрибутов
#
# Использование:  ./build-apk.sh
# Результат:      dist/GmailGenerator.apk
set -euo pipefail
cd "$(dirname "$0")"

# --- поиск инструментов ---
if [ -z "${TOOLS_DIR:-}" ]; then
  if [ -f "$(pwd)/build-tools/apktool.jar" ]; then
    TOOLS_DIR="$(pwd)/build-tools"
  elif [ -f /home/user/build-tools/apktool.jar ]; then
    TOOLS_DIR=/home/user/build-tools
  else
    echo "ОШИБКА: инструменты не найдены. Распакуйте build-tools.tar.gz в $(pwd)/" >&2
    echo "  tar xzf build-tools.tar.gz  (каталог build-tools должен оказаться рядом со скриптом)" >&2
    echo "или укажите TOOLS_DIR=/путь/к/build-tools" >&2
    exit 1
  fi
fi
echo "Инструменты: $TOOLS_DIR"

JRE="$TOOLS_DIR/jre"
APKTOOL_JAR="$TOOLS_DIR/apktool.jar"
APKSIGNER_JAR="$TOOLS_DIR/apksigner.jar"
AAPT2="$TOOLS_DIR/aapt2"
FRAMEWORK_DIR="$TOOLS_DIR/framework"

# извлечь framework при необходимости (если в архиве только android.jar)
if [ ! -f "$FRAMEWORK_DIR/1.apk" ] && [ -f "$TOOLS_DIR/lib/android-24-android.jar" ]; then
  echo "==> Подготовка framework из android.jar"
  "$JRE/bin/java" -jar "$APKTOOL_JAR" if "$TOOLS_DIR/lib/android-24-android.jar" -p "$FRAMEWORK_DIR"
fi

KEYSTORE="gmailgen.jks"
KEY_ALIAS="gmailgen"
KEY_PASS="${KEY_PASS:-gmailgen123}"   # для своего релиза: KEY_PASS=... ./build-apk.sh

mkdir -p dist

echo "==> 1/4  Сборка неподписанного APK из smali и ресурсов"
"$JRE/bin/java" -jar "$APKTOOL_JAR" b app \
    -o dist/GmailGenerator-unsigned.apk \
    -p "$FRAMEWORK_DIR" \
    -a "$AAPT2"

echo "==> 2/4  Генерация ключа подписи (если отсутствует)"
if [ ! -f "$KEYSTORE" ]; then
    "$JRE/bin/keytool" -genkeypair -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
        -keyalg RSA -keysize 2048 -validity 10950 -storetype JKS \
        -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
        -dname "CN=Gmail Generator, OU=App, O=GmailGen, C=RU"
fi

echo "==> 3/4  Подпись APK (схемы v2 и v3)"
"$JRE/bin/java" -jar "$APKSIGNER_JAR" sign \
    --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
    --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
    --min-sdk-version 24 --v2-signing-enabled true --v3-signing-enabled true \
    --out dist/GmailGenerator.apk dist/GmailGenerator-unsigned.apk
rm -f dist/GmailGenerator.apk.idsig

echo "==> 4/4  Проверка подписи"
"$JRE/bin/java" -jar "$APKSIGNER_JAR" verify --verbose dist/GmailGenerator.apk

rm -rf app/build
echo "Готово: dist/GmailGenerator.apk"
