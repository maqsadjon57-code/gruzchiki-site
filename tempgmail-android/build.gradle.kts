/**
 * Корневой скрипт сборки: объявляет версии плагинов, которые применяются в модулях.
 * Сами плагины здесь не применяются (apply false) — их подключает модуль :app.
 */
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    // Плагин компилятора Compose (требуется для Kotlin 2.0+)
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
    id("org.jetbrains.kotlin.kapt") version "2.0.20" apply false
    // Dagger Hilt — внедрение зависимостей
    id("com.google.dagger.hilt.android") version "2.52" apply false
    // Firebase подключается опционально: см. README, раздел «Firebase»
    // id("com.google.gms.google-services") version "4.4.2" apply false
}
