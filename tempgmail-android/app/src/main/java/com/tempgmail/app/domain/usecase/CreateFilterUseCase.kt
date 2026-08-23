package com.tempgmail.app.domain.usecase

import com.tempgmail.app.data.remote.AuthRequiredException
import com.tempgmail.app.data.repository.ApiException
import com.tempgmail.app.data.repository.FilterRepository
import com.tempgmail.app.domain.model.FilterAction
import com.tempgmail.app.domain.model.FilterInfo
import com.tempgmail.app.domain.model.TemporaryEmail
import timber.log.Timber
import javax.inject.Inject

/**
 * Use-case создания Gmail-фильтра для временного адреса.
 * Возвращает типизированный результат, чтобы UI мог отличить
 * «нужна авторизация» от прочих ошибок API.
 */
class CreateFilterUseCase @Inject constructor(
    private val filterRepository: FilterRepository,
) {

    sealed class Result {
        data class Success(val filter: FilterInfo) : Result()
        /** Нужно показать флоу авторизации Google */
        object AuthRequired : Result()
        data class ApiError(val code: Int, val message: String) : Result()
        data class Unknown(val throwable: Throwable) : Result()
    }

    suspend operator fun invoke(email: TemporaryEmail, action: FilterAction): Result {
        return try {
            Result.Success(filterRepository.createFilter(email, action))
        } catch (e: AuthRequiredException) {
            Timber.w("Create filter: auth required")
            Result.AuthRequired
        } catch (e: ApiException) {
            Timber.e(e, "Create filter: api error %d", e.httpCode)
            if (e.isAuthError) Result.AuthRequired else Result.ApiError(e.httpCode, e.body)
        } catch (e: Exception) {
            Timber.e(e, "Create filter: unknown error")
            Result.Unknown(e)
        }
    }
}
