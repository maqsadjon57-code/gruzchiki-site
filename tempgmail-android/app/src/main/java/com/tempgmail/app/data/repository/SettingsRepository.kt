package com.tempgmail.app.data.repository

import com.tempgmail.app.data.local.dao.SettingsDao
import com.tempgmail.app.data.local.entities.SettingsEntity
import com.tempgmail.app.data.local.entities.toDomain
import com.tempgmail.app.data.local.entities.toEntity
import com.tempgmail.app.domain.model.AppLanguage
import com.tempgmail.app.domain.model.AppSettings
import com.tempgmail.app.domain.model.AppTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/** Репозиторий настроек приложения (Room, одна строка) + импорт/экспорт в JSON. */
@Singleton
class SettingsRepository @Inject constructor(
    private val settingsDao: SettingsDao,
) {

    /** Реактивный поток настроек; если строки ещё нет — дефолт. */
    fun observe(): Flow<AppSettings> = settingsDao.observe().map { it?.toDomain() ?: AppSettings() }

    suspend fun get(): AppSettings = withContext(Dispatchers.IO) {
        settingsDao.get()?.toDomain() ?: AppSettings()
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) = withContext(Dispatchers.IO) {
        val current = settingsDao.get()?.toDomain() ?: AppSettings()
        settingsDao.upsert(transform(current).toEntity())
    }

    suspend fun completeOnboarding() = update { it.copy(onboardingCompleted = true) }

    // ---------- Импорт/экспорт настроек в JSON ----------

    fun exportJson(settings: AppSettings): String = JSONObject().apply {
        put("theme", settings.theme.name)
        put("language", settings.language.tag)
        put("label_length", settings.labelLength)
        put("use_digits", settings.useDigits)
        put("use_letters", settings.useLetters)
        put("auto_cleanup_enabled", settings.autoCleanupEnabled)
        put("auto_cleanup_days", settings.autoCleanupDays)
    }.toString(2)

    /** @throws IllegalArgumentException при битом JSON или неизвестных значениях */
    suspend fun importJson(json: String) = withContext(Dispatchers.IO) {
        try {
            val o = JSONObject(json)
            val current = settingsDao.get() ?: SettingsEntity()
            settingsDao.upsert(
                current.copy(
                    theme = o.optString("theme", current.theme).let { t ->
                        AppTheme.entries.firstOrNull { it.name == t }?.name ?: current.theme
                    },
                    language = AppLanguage.fromTag(o.optString("language", current.language)).tag,
                    label_length = o.optInt("label_length", current.label_length).coerceIn(4, 16),
                    use_digits = o.optBoolean("use_digits", current.use_digits),
                    use_letters = o.optBoolean("use_letters", current.use_letters),
                    auto_cleanup_enabled = o.optBoolean("auto_cleanup_enabled", current.auto_cleanup_enabled),
                    auto_cleanup_days = o.optInt("auto_cleanup_days", current.auto_cleanup_days).coerceIn(1, 365),
                )
            )
        } catch (e: Exception) {
            throw IllegalArgumentException("Bad settings JSON", e)
        }
    }
}
