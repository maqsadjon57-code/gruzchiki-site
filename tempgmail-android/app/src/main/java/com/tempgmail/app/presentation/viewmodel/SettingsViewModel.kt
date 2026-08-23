package com.tempgmail.app.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tempgmail.app.data.repository.AccountRepository
import com.tempgmail.app.data.repository.SettingsRepository
import com.tempgmail.app.domain.model.AppSettings
import com.tempgmail.app.domain.model.AppTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** События экрана настроек (Snackbar). */
sealed interface SettingsEvent {
    data class Message(val textRes: Int) : SettingsEvent
}

/** ViewModel экрана настроек: тема, язык, параметры генерации, автоочистка, импорт/экспорт. */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    val accountRepository: AccountRepository,
) : ViewModel() {

    val settings: StateFlow<AppSettings> = settingsRepository.observe()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    val accounts = accountRepository.observeAccounts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _events = Channel<SettingsEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun setTheme(theme: AppTheme) = launch { settingsRepository.update { it.copy(theme = theme) } }

    fun setLanguage(tag: String) = launch {
        settingsRepository.update {
            it.copy(language = com.tempgmail.app.domain.model.AppLanguage.fromTag(tag))
        }
    }

    fun setLabelLength(length: Int) = launch {
        settingsRepository.update { it.copy(labelLength = length.coerceIn(4, 16)) }
    }

    fun setUseDigits(use: Boolean) = launch {
        settingsRepository.update { it.copy(useDigits = use) }
    }

    fun setUseLetters(use: Boolean) = launch {
        settingsRepository.update { it.copy(useLetters = use) }
    }

    fun setAutoCleanup(enabled: Boolean) = launch {
        settingsRepository.update { it.copy(autoCleanupEnabled = enabled) }
    }

    fun setCleanupDays(days: Int) = launch {
        settingsRepository.update { it.copy(autoCleanupDays = days.coerceIn(1, 365)) }
    }

    fun setActiveAccount(email: String) = launch { accountRepository.setActive(email) }

    fun removeAccount(email: String) = launch { accountRepository.remove(email) }

    /** Экспорт настроек в JSON-строку (запись в файл делает UI через SAF). */
    suspend fun exportJson(): String = settingsRepository.exportJson(settings.value)

    /** Импорт настроек из JSON, прочитанного UI из файла. */
    fun importJson(json: String) = launch {
        try {
            settingsRepository.importJson(json)
            _events.send(
                SettingsEvent.Message(com.tempgmail.app.R.string.settings_import_done)
            )
        } catch (e: IllegalArgumentException) {
            Timber.e(e, "settings import failed")
            _events.send(
                SettingsEvent.Message(com.tempgmail.app.R.string.settings_import_error)
            )
        }
    }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: Exception) {
                Timber.e(e, "settings update failed")
                _events.send(SettingsEvent.Message(com.tempgmail.app.R.string.error_generic))
            }
        }
    }
}
