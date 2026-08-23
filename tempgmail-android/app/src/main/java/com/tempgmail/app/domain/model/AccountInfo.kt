package com.tempgmail.app.domain.model

/**
 * Добавленный пользователем Gmail-аккаунт (для мультиаккаунтности).
 * OAuth-токен здесь НЕ хранится: он каждый раз получается через
 * GoogleAuthUtil из системного аккаунта Google — это безопаснее,
 * чем хранить токен, и избавляет от ротации refresh-токенов.
 */
data class AccountInfo(
    val id: Long = 0,
    /** Адрес аккаунта (личная часть перед @gmail.com используется в плюс-адресе) */
    val email: String,
    /** Отображаемое имя (Google profile name), если доступно */
    val displayName: String? = null,
    /** Является ли аккаунт текущим (активным) для генерации */
    val isActive: Boolean = false,
)
