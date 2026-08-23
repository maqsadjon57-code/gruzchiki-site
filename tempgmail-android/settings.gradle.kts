/**
 * Корневой файл настроек Gradle-проекта «Временный Gmail».
 * Здесь объявляются репозитории плагинов и зависимостей и подключаемые модули.
 */
pluginManagement {
    repositories {
        google()            // Android Gradle Plugin и Google-библиотеки
        mavenCentral()      // Основной репозиторий JVM-библиотек
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TempGmail"
include(":app")
