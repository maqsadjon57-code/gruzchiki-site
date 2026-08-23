package com.tempgmail.app.util

import java.security.SecureRandom

/**
 * Генератор случайных меток для плюс-адресов.
 * Используется SecureRandom: метки не должны быть предсказуемыми.
 */
object LabelGenerator {

    private const val LETTERS = "abcdefghijklmnopqrstuvwxyz"
    private const val DIGITS = "0123456789"
    private val random = SecureRandom()

    /**
     * Генерирует метку заданной длины.
     * @param length длина метки (вызывающий код ограничивает 4..16)
     * @param useLetters разрешить буквы a-z
     * @param useDigits разрешить цифры 0-9
     * Если оба флага выключены, принудительно включаем буквы —
     * пустая метка недопустима.
     */
    fun generate(length: Int, useLetters: Boolean, useDigits: Boolean): String {
        val lettersOk = useLetters || !useDigits
        val alphabet = buildString {
            if (lettersOk) append(LETTERS)
            if (useDigits) append(DIGITS)
        }
        return buildString(length) {
            repeat(length) { append(alphabet[random.nextInt(alphabet.length)]) }
        }
    }

    /**
     * «Умная» метка по названию сайта: нормализует имя и добавляет
     * случайный суффикс, чтобы метки не повторялись между адресами.
     * Пример: "Amazon Shop" -> "amazon-ab12cd"
     */
    fun generateForSite(site: String, suffixLength: Int = 6): String {
        val base = site.trim().lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .trim('-')
            .ifBlank { "site" }
            .take(24)
        val suffix = generate(suffixLength, useLetters = true, useDigits = true)
        return "$base-$suffix"
    }

    /** Допустимые символы пользовательской метки (Gmail плюс-адресация). */
    private val CUSTOM_LABEL_REGEX = Regex("^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$")

    /** Проверка пользовательской метки на допустимость в адресе Gmail. */
    fun isValidCustomLabel(label: String): Boolean =
        label.length in 1..30 && CUSTOM_LABEL_REGEX.matches(label)
}
