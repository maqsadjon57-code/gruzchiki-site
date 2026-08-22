#!/usr/bin/env bash
# Сборка APK «Генератор Gmail» (WebView-обертка оffициального веб-приложения Aspose).
#
# Исходники приложения написаны на smali (декомпилируемый формат Dalvik-байткода),
# поэтому для сборки НЕ нужны Android Studio / JDK с javac. Используются:
#   - JRE (java):        $TOOLS_DIR/jdk4py-extract/jdk4py/java-runtime
#   - Apktool 2.9.3:     $TOOLS_DIR/postar/package/lib/apktool.jar   (сборка APK из smali+res)
#   - aapt2 (64-бит):    $TOOLS_DIR/aapt2_64                         (компиляция ресурсов)
#   - framework 1.apk:   $TOOLS_DIR/framework/1.apk                  (из android.jar API 24)
#   - apksigner 0.9:     $TOOLS_DIR/postar/package/lib/apksigner.jar (подпись v2+v3)
#
# Использование:  ./build-apk.sh
# Результат:      dist/GmailGenerator.apk
set -euo pipefail
cd "$(dirname "$0")"

TOOLS_DIR="${TOOLS_DIR:-/home/user/build-tools}"
JRE="$TOOLS_DIR/jdk4py-extract/jdk4py/java-runtime"
APKTOOL_JAR="$TOOLS_DIR/postar/package/lib/apktool.jar"
APKSIGNER_JAR="$TOOLS_DIR/postar/package/lib/apksigner.jar"
AAPT2="$TOOLS_DIR/aapt2_64"
FRAMEWORK_DIR="$TOOLS_DIR/framework"

KEYSTORE="gmailgen.jks"
KEY_ALIAS="gmailgen"
KEY_PASS="${KEY_PASS:-gmailgen123}"   # для своего релиза задайте свой пароль: KEY_PASS=... ./build-apk.sh

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
