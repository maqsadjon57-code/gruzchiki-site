package com.tempgmail.app.util

/**
 * Утилиты для работы с email-адресами и плюс-адресацией Gmail.
 */
object EmailUtils {

    private val GMAIL_REGEX = Regex("^[a-z0-9](\\.?[a-z0-9_+-])*@g(oogle)?mail\\.com$", RegexOption.IGNORE_CASE)

    /** Строгая проверка, что адрес является Gmail/Googlemail. */
    fun isValidGmail(address: String): Boolean =
        address.isNotBlank() && address.length <= 254 && GMAIL_REGEX.matches(address.trim())

    /** Собирает плюс-адрес: логин + '+' + метка + домен. */
    fun buildPlusAddress(mainEmail: String, label: String): String {
        val at = mainEmail.indexOf('@')
        require(at > 0) { "Invalid email: $mainEmail" }
        return mainEmail.substring(0, at) + "+" + label + mainEmail.substring(at)
    }

    /** Поисковый запрос Gmail для фильтра по адресу. */
    fun filterQuery(fullEmail: String): String = "to:($fullEmail)"

    /** Нормализация: Gmail игнорирует регистр и точки в логине. */
    fun normalize(email: String): String = email.trim().lowercase()
}
