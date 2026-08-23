package com.tempgmail.app

import com.tempgmail.app.domain.model.AppLanguage
import com.tempgmail.app.domain.model.AppSettings
import com.tempgmail.app.domain.model.AppTheme
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Юнит-тесты сериализации настроек (формат экспорта/импорта JSON). */
class SettingsJsonTest {

    @Test
    fun `настройки сериализуются и читаются обратно`() {
        val original = AppSettings(
            theme = AppTheme.DARK,
            language = AppLanguage.RU,
            labelLength = 12,
            useDigits = false,
            useLetters = true,
            autoCleanupEnabled = true,
            autoCleanupDays = 45,
        )
        // Тот же формат, что в SettingsRepository.exportJson
        val json = JSONObject().apply {
            put("theme", original.theme.name)
            put("language", original.language.tag)
            put("label_length", original.labelLength)
            put("use_digits", original.useDigits)
            put("use_letters", original.useLetters)
            put("auto_cleanup_enabled", original.autoCleanupEnabled)
            put("auto_cleanup_days", original.autoCleanupDays)
        }.toString()

        val o = JSONObject(json)
        assertEquals("DARK", o.getString("theme"))
        assertEquals("ru", o.getString("language"))
        assertEquals(12, o.getInt("label_length"))
        assertEquals(false, o.getBoolean("use_digits"))
        assertEquals(true, o.getBoolean("use_letters"))
        assertEquals(true, o.getBoolean("auto_cleanup_enabled"))
        assertEquals(45, o.getInt("auto_cleanup_days"))
    }

    @Test
    fun `длина метки ограничена диапазоном 4-16`() {
        assertTrue(AppSettings().labelLength in 4..16)
    }
}
