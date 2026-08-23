package com.tempgmail.app.domain.model

/**
 * Доменная модель временного email-адреса (плюс-адрес вида login+метка@gmail.com).
 * Не зависит от слоя данных — используется в use-case'ах и UI.
 */
data class TemporaryEmail(
    val id: Long = 0,
    /** Основной аккаунт Gmail, к которому привязан адрес */
    val mainEmail: String,
    /** Сгенерированная или пользовательская метка после «+» */
    val label: String,
    /** Полный адрес, например login+abcdefgh@gmail.com */
    val fullEmail: String,
    /** Метка времени создания (epoch millis) */
    val createdAt: Long,
    /** Активен ли адрес (отключённые остаются в истории) */
    val isActive: Boolean = true,
    /** ID связанного фильтра Gmail (null — фильтр не создавался) */
    val filterId: String? = null,
    /** Заметка пользователя */
    val notes: String? = null,
    /** Сайт, для которого создан адрес (умная метка) */
    val site: String? = null,
)
