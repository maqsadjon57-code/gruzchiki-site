package com.tempgmail.app.domain.model

/**
 * Действие фильтра Gmail. Описывает, что делать с письмами,
 * приходящими на временный адрес.
 */
enum class FilterAction {
    /** Удалять письма (ярлык TRASH) */
    DELETE,
    /** Пропускать папку «Входящие» (архивировать) */
    ARCHIVE,
    /** Помечать прочитанными (снять ярлык UNREAD) */
    MARK_READ,
    /** Применять пользовательский ярлык */
    APPLY_LABEL,
    /** Помечать как спам (ярлык SPAM) */
    SPAM;

    companion object {
        val DEFAULT = DELETE
    }
}

/**
 * Информация о созданном фильтре (доменная модель).
 */
data class FilterInfo(
    val id: Long = 0,
    val emailId: Long,
    /** Идентификатор фильтра в Gmail (серверный) */
    val gmailFilterId: String? = null,
    val action: FilterAction,
    /** Полный поисковый запрос фильтра, например to:(a+b@gmail.com) */
    val query: String,
    val isEnabled: Boolean = true,
)
