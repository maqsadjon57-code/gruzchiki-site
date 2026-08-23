package com.tempgmail.app.data.repository

import com.tempgmail.app.data.local.dao.TempEmailDao
import com.tempgmail.app.data.local.entities.toDomain
import com.tempgmail.app.data.local.entities.toEntity
import com.tempgmail.app.domain.model.TemporaryEmail
import com.tempgmail.app.util.EmailUtils
import com.tempgmail.app.util.LabelGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий временных адресов: генерация (в т.ч. «умные» метки),
 * история с поиском/фильтрами, изменение статуса, удаление, автоочистка.
 */
@Singleton
class TempEmailRepository @Inject constructor(
    private val dao: TempEmailDao,
) {

    /** Реактивная история адресов. */
    fun observeHistory(account: String?, query: String, status: Boolean?): Flow<List<TemporaryEmail>> =
        dao.observeHistory(account, query.trim(), status)
            .map { list -> list.map { it.toDomain() } }

    /**
     * Создаёт и сохраняет новый временный адрес.
     *
     * @param mainEmail основной Gmail (валидируется)
     * @param customLabel пользовательская метка (null — случайная)
     * @param site сайт для «умной» метки (имеет приоритет над случайной)
     * @param labelLength/useDigits/useLetters параметры случайной метки из настроек
     * @throws IllegalArgumentException при невалидном email/метке
     * @throws DuplicateEmailException если такой адрес уже есть в истории
     */
    suspend fun generate(
        mainEmail: String,
        customLabel: String?,
        site: String?,
        labelLength: Int,
        useDigits: Boolean,
        useLetters: Boolean,
    ): TemporaryEmail = withContext(Dispatchers.IO) {
        val normalized = EmailUtils.normalize(mainEmail)
        require(EmailUtils.isValidGmail(normalized)) { "invalid_gmail" }

        val label: String = when {
            !customLabel.isNullOrBlank() -> {
                val custom = customLabel.trim().lowercase()
                require(LabelGenerator.isValidCustomLabel(custom)) { "invalid_label" }
                custom
            }
            !site.isNullOrBlank() -> LabelGenerator.generateForSite(site)
            else -> LabelGenerator.generate(labelLength.coerceIn(4, 16), useLetters, useDigits)
        }

        val fullEmail = EmailUtils.buildPlusAddress(normalized, label)
        if (dao.findByFullEmail(fullEmail) != null) throw DuplicateEmailException(fullEmail)

        val entity = TemporaryEmail(
            mainEmail = normalized,
            label = label,
            fullEmail = fullEmail,
            createdAt = System.currentTimeMillis(),
            isActive = true,
            site = site?.trim()?.takeIf { it.isNotBlank() },
        ).toEntity()

        val id = dao.insert(entity)
        entity.copy(id = id).toDomain()
    }

    /** Обновляет filter_id в истории (после создания фильтра в Gmail). */
    suspend fun attachFilter(emailId: Long, filterId: String?) = withContext(Dispatchers.IO) {
        dao.setFilterId(emailId, filterId)
    }

    /** Включает/выключает адрес (без удаления из истории). */
    suspend fun setActive(id: Long, active: Boolean) = withContext(Dispatchers.IO) {
        dao.setActive(id, active)
    }

    suspend fun getById(id: Long): TemporaryEmail? = withContext(Dispatchers.IO) {
        dao.getById(id)?.toDomain()
    }

    suspend fun delete(id: Long) = withContext(Dispatchers.IO) {
        dao.deleteById(id)
    }

    /** Автоочистка: удаляет адреса старше [days] дней. Возвращает число удалённых. */
    suspend fun cleanupOlderThan(days: Int): Int = withContext(Dispatchers.IO) {
        val threshold = System.currentTimeMillis() - days.toLong() * 24 * 60 * 60 * 1000
        dao.deleteOlderThan(threshold)
    }

    /** Последний созданный адрес (для виджета). */
    suspend fun getLatest(): TemporaryEmail? = withContext(Dispatchers.IO) {
        dao.getLatest()?.toDomain()
    }

    /** Экспорт истории в CSV (RFC 4180, экранирование кавычек). */
    suspend fun exportCsv(account: String?): String = withContext(Dispatchers.IO) {
        val rows = dao.observeHistory(account, "", null)
        // Получаем текущий снимок без подписки: читаем один раз
        val header = "main_email,label,full_email,created_at,is_active,filter_id,site,notes"
        val body = rowsToCsv(dao.getAllOnce().filter { account == null || it.main_email == account })
        header + "\n" + body
    }

    private fun rowsToCsv(rows: List<com.tempgmail.app.data.local.entities.TemporaryEmailEntity>): String =
        rows.joinToString("\n") { e ->
            listOf(
                e.main_email, e.label, e.full_email,
                e.created_at.toString(), e.is_active.toString(),
                e.filter_id ?: "", e.site ?: "", e.notes ?: "",
            ).joinToString(",") { field ->
                if (field.any { it == ',' || it == '"' || it == '\n' }) {
                    "\"" + field.replace("\"", "\"\"") + "\""
                } else field
            }
        }
}

/** Попытка сгенерировать адрес, который уже существует в истории. */
class DuplicateEmailException(val email: String) : Exception("Duplicate: $email")
