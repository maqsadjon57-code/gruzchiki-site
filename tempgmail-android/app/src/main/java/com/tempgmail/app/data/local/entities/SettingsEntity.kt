package com.tempgmail.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.tempgmail.app.domain.model.AppLanguage
import com.tempgmail.app.domain.model.AppSettings
import com.tempgmail.app.domain.model.AppTheme

/**
 * Room-сущность таблицы settings — одна строка (id = 1) с настройками приложения.
 * Ключ-значение не используем: типизированная строка безопаснее.
 */
@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey val id: Int = 1,
    val theme: String = "SYSTEM",
    val language: String = "system",
    val label_length: Int = 8,
    val use_digits: Boolean = true,
    val use_letters: Boolean = true,
    val auto_cleanup_enabled: Boolean = false,
    val auto_cleanup_days: Int = 30,
    val onboarding_completed: Boolean = false,
    val last_synced: Long = 0L,
)

fun SettingsEntity.toDomain() = AppSettings(
    theme = runCatching { AppTheme.valueOf(theme) }.getOrDefault(AppTheme.SYSTEM),
    language = AppLanguage.fromTag(language),
    labelLength = label_length.coerceIn(4, 16),
    useDigits = use_digits,
    useLetters = use_letters,
    autoCleanupEnabled = auto_cleanup_enabled,
    autoCleanupDays = auto_cleanup_days.coerceIn(1, 365),
    onboardingCompleted = onboarding_completed,
    lastSyncedAt = last_synced,
)

fun AppSettings.toEntity() = SettingsEntity(
    theme = theme.name,
    language = language.tag,
    label_length = labelLength,
    use_digits = useDigits,
    use_letters = useLetters,
    auto_cleanup_enabled = autoCleanupEnabled,
    auto_cleanup_days = autoCleanupDays,
    onboarding_completed = onboardingCompleted,
    last_synced = lastSyncedAt,
)
