package com.tempgmail.app.domain.usecase

import com.tempgmail.app.data.repository.ApiException
import com.tempgmail.app.data.repository.FilterRepository
import com.tempgmail.app.data.repository.TempEmailRepository
import com.tempgmail.app.domain.model.TemporaryEmail
import timber.log.Timber
import javax.inject.Inject

/**
 * Use-case удаления временного адреса из истории.
 * По желанию пользователя удаляет и связанный фильтр в Gmail:
 * сначала пробуем API (ошибки не калечат удаление из истории),
 * затем чистим локальную БД.
 */
class DeleteEmailUseCase @Inject constructor(
    private val emailRepository: TempEmailRepository,
    private val filterRepository: FilterRepository,
) {

    sealed class Result {
        object Success : Result()
        /** Адрес удалён, но фильтр в Gmail удалить не удалось */
        data class FilterNotDeleted(val cause: Throwable) : Result()
    }

    suspend operator fun invoke(email: TemporaryEmail, alsoDeleteGmailFilter: Boolean): Result {
        var filterError: Throwable? = null
        if (alsoDeleteGmailFilter && email.filterId != null) {
            try {
                filterRepository.deleteFilter(email)
            } catch (e: ApiException) {
                Timber.e(e, "Failed to delete gmail filter %s", email.filterId)
                filterError = e
            } catch (e: Exception) {
                Timber.e(e, "Failed to delete gmail filter %s", email.filterId)
                filterError = e
            }
        }
        emailRepository.delete(email.id)
        return filterError?.let { Result.FilterNotDeleted(it) } ?: Result.Success
    }
}
