package com.tempgmail.app.domain.usecase

import com.tempgmail.app.data.repository.DuplicateEmailException
import com.tempgmail.app.data.repository.SettingsRepository
import com.tempgmail.app.data.repository.TempEmailRepository
import com.tempgmail.app.domain.model.TemporaryEmail
import javax.inject.Inject

/**
 * Use-case генерации временного адреса.
 * Инкапсулирует бизнес-правила: валидация, умные метки, сохранение в историю.
 */
class GenerateEmailUseCase @Inject constructor(
    private val emailRepository: TempEmailRepository,
    private val settingsRepository: SettingsRepository,
) {

    sealed class Result {
        data class Success(val email: TemporaryEmail) : Result()
        data class Error(val reason: Reason) : Result()
    }

    enum class Reason { INVALID_GMAIL, INVALID_LABEL, DUPLICATE, UNKNOWN }

    suspend operator fun invoke(
        mainEmail: String,
        customLabel: String? = null,
        site: String? = null,
    ): Result {
        return try {
            val settings = settingsRepository.get()
            val email = emailRepository.generate(
                mainEmail = mainEmail,
                customLabel = customLabel,
                site = site,
                labelLength = settings.labelLength,
                useDigits = settings.useDigits,
                useLetters = settings.useLetters,
            )
            Result.Success(email)
        } catch (e: DuplicateEmailException) {
            Result.Error(Reason.DUPLICATE)
        } catch (e: IllegalArgumentException) {
            Result.Error(if (e.message == "invalid_label") Reason.INVALID_LABEL else Reason.INVALID_GMAIL)
        } catch (e: Exception) {
            Result.Error(Reason.UNKNOWN)
        }
    }
}
