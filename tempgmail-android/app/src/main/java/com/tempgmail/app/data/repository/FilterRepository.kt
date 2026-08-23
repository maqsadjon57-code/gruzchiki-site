package com.tempgmail.app.data.repository

import com.tempgmail.app.data.local.dao.FilterDao
import com.tempgmail.app.data.local.dao.TempEmailDao
import com.tempgmail.app.data.local.entities.toDomain
import com.tempgmail.app.data.local.entities.toEntity
import com.tempgmail.app.data.remote.GmailApi
import com.tempgmail.app.data.remote.dto.FilterActionDto
import com.tempgmail.app.data.remote.dto.FilterCriteriaDto
import com.tempgmail.app.data.remote.dto.GmailFilterDto
import com.tempgmail.app.domain.model.FilterAction
import com.tempgmail.app.domain.model.FilterInfo
import com.tempgmail.app.domain.model.TemporaryEmail
import com.tempgmail.app.util.EmailUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий фильтров: создаёт фильтры в Gmail через API,
 * локально кэширует их состояние и умеет удалять/переключать.
 */
@Singleton
class FilterRepository @Inject constructor(
    private val api: GmailApi,
    private val filterDao: FilterDao,
    private val emailDao: TempEmailDao,
) {

    /** Локально закэшированные фильтры (для экрана управления). */
    fun observeLocalFilters(): Flow<List<FilterInfo>> =
        filterDao.observeAll().map { list -> list.map { it.toDomain() } }

    /**
     * Создаёт фильтр в Gmail для временного адреса и сохраняет его локально.
     * @throws ApiException при ошибке Gmail API (с кодом HTTP)
     */
    suspend fun createFilter(email: TemporaryEmail, action: FilterAction): FilterInfo =
        withContext(Dispatchers.IO) {
            val query = EmailUtils.filterQuery(email.fullEmail)
            val request = GmailFilterDto(
                criteria = FilterCriteriaDto(to = email.fullEmail),
                action = action.toGmailAction(),
            )
            val response = api.createFilter(request)
            if (!response.isSuccessful) {
                throw ApiException(response.code(), response.errorBody()?.string().orEmpty())
            }
            val created = response.body() ?: throw ApiException(response.code(), "empty body")
            val info = FilterInfo(
                emailId = email.id,
                gmailFilterId = created.id,
                action = action,
                query = query,
                isEnabled = true,
            )
            filterDao.insert(info.toEntity())
            emailDao.setFilterId(email.id, created.id)
            info
        }

    /** Удаляет фильтр в Gmail (если был создан) и из локальной БД. */
    suspend fun deleteFilter(email: TemporaryEmail) = withContext(Dispatchers.IO) {
        val local = filterDao.getByEmailId(email.id)
        local?.gmail_filter_id?.let { gmailId ->
            val response = api.deleteFilter(gmailId)
            // 204 — успех; 404 — фильтр уже удалён на сервере, это тоже ок
            if (!response.isSuccessful && response.code() != 404) {
                throw ApiException(response.code(), response.errorBody()?.string().orEmpty())
            }
        }
        filterDao.deleteByEmailId(email.id)
        emailDao.setFilterId(email.id, null)
    }

    /**
     * Счётчик писем на адрес (resultSizeEstimate). Кэшируется вызывающим кодом,
     * потому что запрос тарифицируется квотой API.
     */
    suspend fun countMessages(fullEmail: String): Int = withContext(Dispatchers.IO) {
        val response = api.listMessages(query = "to:${fullEmail}", maxResults = 1)
        if (!response.isSuccessful) {
            throw ApiException(response.code(), response.errorBody()?.string().orEmpty())
        }
        response.body()?.resultSizeEstimate ?: 0
    }

    /** Синхронизация: сопоставляет локальные записи с фильтрами, которые есть в Gmail. */
    suspend fun syncFromGmail(): List<FilterInfo> = withContext(Dispatchers.IO) {
        val response = api.listFilters()
        if (!response.isSuccessful) {
            throw ApiException(response.code(), response.errorBody()?.string().orEmpty())
        }
        val handled = mutableListOf<FilterInfo>()
        response.body()?.filters.orEmpty()
            .filter { it.id != null && it.criteria.to?.contains('+') == true }
            .map { remote ->
                FilterInfo(
                    emailId = 0,
                    gmailFilterId = remote.id,
                    action = FilterAction.fromGmail(remote.action),
                    query = EmailUtils.filterQuery(remote.criteria.to.orEmpty()),
                    isEnabled = true,
                )
            }
            .also { handled.addAll(it) }
        handled
    }
}

/** Маппинг доменного действия фильтра в DTO Gmail API. */
fun FilterAction.toGmailAction(): FilterActionDto = when (this) {
    FilterAction.DELETE -> FilterActionDto(
        addLabelIds = listOf("TRASH"),
        removeLabelIds = listOf("INBOX"),
    )
    FilterAction.ARCHIVE -> FilterActionDto(removeLabelIds = listOf("INBOX"))
    FilterAction.MARK_READ -> FilterActionDto(removeLabelIds = listOf("UNREAD"))
    FilterAction.APPLY_LABEL -> FilterActionDto(
        addLabelIds = listOf("Label_Temp"),
        removeLabelIds = listOf("INBOX"),
    )
    FilterAction.SPAM -> FilterActionDto(
        addLabelIds = listOf("SPAM"),
        removeLabelIds = listOf("INBOX"),
    )
}

/** Обратный маппинг (при синхронизации списка фильтров с сервера). */
fun FilterAction.Companion.fromGmail(action: FilterActionDto): FilterAction = when {
    action.addLabelIds?.contains("TRASH") == true -> FilterAction.DELETE
    action.addLabelIds?.contains("SPAM") == true -> FilterAction.SPAM
    action.removeLabelIds?.contains("UNREAD") == true -> FilterAction.MARK_READ
    action.addLabelIds?.isNotEmpty() == true -> FilterAction.APPLY_LABEL
    action.removeLabelIds?.contains("INBOX") == true -> FilterAction.ARCHIVE
    else -> FilterAction.DEFAULT
}

/** Ошибка вызова Gmail API с HTTP-кодом и телом ответа. */
class ApiException(val httpCode: Int, val body: String) :
    Exception("HTTP $httpCode: ${body.take(200)}") {

    /** 401/403 — обычно требуется повторная авторизация пользователя. */
    val isAuthError: Boolean get() = httpCode == 401 || httpCode == 403
}
