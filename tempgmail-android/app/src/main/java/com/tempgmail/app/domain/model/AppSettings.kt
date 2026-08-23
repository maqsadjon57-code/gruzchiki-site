package com.tempgmail.app.domain.model

/**
 * Настройки приложения (доменная модель).
 * Имена значений тем/языка сериализуются в строки для Room.
 */
data class AppSettings(
    val theme: AppTheme = AppTheme.SYSTEM,
    val language: AppLanguage = AppLanguage.SYSTEM,
    /** Длина случайной метки (4..16) */
    val labelLength: Int = 8,
    /** Включать ли цифры в метку */
    val useDigits: Boolean = true,
    /** Включать ли строчные буквы в метку */
    val useLetters: Boolean = true,
    /** Автоудаление адресов старше N дней */
    val autoCleanupEnabled: Boolean = false,
    val autoCleanupDays: Int = 30,
    /** Показывать онбординг при следующем запуске */
    val onboardingCompleted: Boolean = false,
    /** Timestamp последней синхронизации фильтров с Gmail */
    val lastSyncedAt: Long = 0L,
)

enum class AppTheme { LIGHT, DARK, SYSTEM }

enum class AppLanguage(val tag: String) {
    SYSTEM("system"),
    RU("ru"),
    EN("en");

    companion object {
        fun fromTag(tag: String): AppLanguage =
            entries.firstOrNull { it.tag == tag } ?: SYSTEM
    }
}
