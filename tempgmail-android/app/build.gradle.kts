/**
 * Скрипт сборки модуля приложения :app.
 * Здесь описаны SDK-версии, signing-комфиги, типы сборки и все зависимости.
 */
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.kapt")
    id("com.google.dagger.hilt.android")
    // Раскомментируйте при подключении Firebase (и положите google-services.json в app/)
    // id("com.google.gms.google-services")
    // id("com.google.firebase.crashlytics") version "3.0.2"
}

android {
    namespace = "com.tempgmail.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tempgmail.app"
        minSdk = 24                      // Android 7.0 — охват ~95% устройств
        targetSdk = 34                   // Android 14
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    // Подпись release-сборки. Ключ лежит в keys/tempgmail-release.jks,
    // пароли можно переопределить в gradle.properties локали (не коммитить!).
    signingConfigs {
        create("release") {
            val ksFile = rootProject.file("keys/tempgmail-release.jks")
            if (ksFile.exists()) {
                storeFile = ksFile
                keyAlias = findProperty("TEMP_GMAIL_KEY_ALIAS") as String? ?: "tempgmail"
                storePassword = findProperty("TEMP_GMAIL_STORE_PASSWORD") as String? ?: "TempGmail2025!"
                keyPassword = findProperty("TEMP_GMAIL_KEY_PASSWORD") as String? ?: "TempGmail2025!"
            }
        }
    }

    buildTypes {
        release {
            if (rootProject.file("keys/tempgmail-release.jks").exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true       // обфускация и сжатие кода (ProGuard/R8)
            isShrinkResources = true     // вырезание неиспользуемых ресурсов
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources { excludes += "META-INF/{AL2.0,LGPL2.1,INDEX.LIST,DEPENDENCIES}" }
    }
}

dependencies {
    // ---------- Ядро Android / Kotlin ----------
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.5")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // ---------- Jetpack Compose (Material 3) ----------
    implementation(platform("androidx.compose:compose-bom:2024.09.02"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    // Расширенный набор Material-иконок (сотни готовых иконок из коробки)
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // ---------- Навигация ----------
    implementation("androidx.navigation:navigation-compose:2.8.1")
    implementation("androidx.compose.material3:material3-window-size-class:1.3.0")

    // ---------- DI: Dagger Hilt ----------
    implementation("com.google.dagger:hilt-android:2.52")
    kapt("com.google.dagger:hilt-android-compiler:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // ---------- База данных Room ----------
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")   // suspend/Flow-интеграция
    kapt("androidx.room:room-compiler:2.6.1")

    // ---------- Сеть (Gmail API) ----------
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // ---------- Google Sign-In / OAuth ----------
    implementation("com.google.android.gms:play-services-auth:21.2.0")

    // ---------- Фоновые задачи ----------
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // ---------- QR-код (ZXing) ----------
    implementation("com.google.zxing:core:3.5.3")

    // ---------- Логирование ----------
    implementation("com.jakewharton.timber:timber:5.0.1")

    // ---------- Firebase (опционально, раскомментировать вместе с плагином) ----------
    // implementation(platform("com.google.firebase:firebase-bom:33.4.0"))
    // implementation("com.google.firebase:firebase-analytics")
    // implementation("com.google.firebase:firebase-crashlytics")
    // implementation("com.google.firebase:firebase-messaging")

    // ---------- Тесты ----------
    testImplementation("junit:junit:4.13.2")
    testImplementation("io.mockk:mockk:1.13.12")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("app.cash.turbine:turbine:1.1.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.09.02"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
