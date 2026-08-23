package com.tempgmail.app.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tempgmail.app.data.repository.AccountRepository
import com.tempgmail.app.data.repository.TempEmailRepository
import com.tempgmail.app.domain.model.TemporaryEmail
import com.tempgmail.app.domain.usecase.DeleteEmailUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/** Фильтр списка истории по статусу адреса. */
enum class HistoryFilter { ALL, ACTIVE, DISABLED }

data class HistoryUiState(
    val query: String = "",
    val filter: HistoryFilter = HistoryFilter.ALL,
)

sealed interface HistoryEvent {
    data class Message(val textRes: Int, val arg: String? = null) : HistoryEvent
    /** Экспорт готов — content нужно отдать в Share Sheet */
    data class ShareCsv(val fileName: String) : HistoryEvent
}

/** ViewModel экрана истории адресов. */
@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val emailRepository: TempEmailRepository,
    private val accountRepository: AccountRepository,
    private val deleteEmail: DeleteEmailUseCase,
) : ViewModel() {

    private val _ui = MutableStateFlow(HistoryUiState())
    val ui: StateFlow<HistoryUiState> = _ui.asStateFlow()

    private val _events = Channel<HistoryEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    /** История активного аккаунта с учётом поиска и фильтра. */
    @OptIn(ExperimentalCoroutinesApi::class)
    val history: StateFlow<List<TemporaryEmail>> = combine(
        accountRepository.observeActive(),
        _ui,
    ) { account, ui -> Triple(account?.email, ui.query, ui.filter) }
        .flatMapLatest { (account, query, filter) ->
            val status = when (filter) {
                HistoryFilter.ALL -> null
                HistoryFilter.ACTIVE -> true
                HistoryFilter.DISABLED -> false
            }
            // null-аккаунт = показываем историю всех аккаунтов
            emailRepository.observeHistory(account, query, status)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun onQueryChange(query: String) {
        _ui.value = _ui.value.copy(query = query)
    }

    fun onFilterChange(filter: HistoryFilter) {
        _ui.value = _ui.value.copy(filter = filter)
    }

    /** Переключение «активен/отключён» прямо из карточки. */
    fun toggleActive(email: TemporaryEmail) {
        viewModelScope.launch {
            try {
                emailRepository.setActive(email.id, !email.isActive)
            } catch (e: Exception) {
                Timber.e(e, "toggleActive failed")
                _events.send(HistoryEvent.Message(com.tempgmail.app.R.string.error_generic))
            }
        }
    }

    /** Удаление адреса; по выбору пользователя — и его фильтра в Gmail. */
    fun delete(email: TemporaryEmail, alsoDeleteFilter: Boolean) {
        viewModelScope.launch {
            when (deleteEmail(email, alsoDeleteFilter)) {
                DeleteEmailUseCase.Result.Success ->
                    _events.send(HistoryEvent.Message(com.tempgmail.app.R.string.history_export_done))
                is DeleteEmailUseCase.Result.FilterNotDeleted ->
                    _events.send(HistoryEvent.Message(com.tempgmail.app.R.string.filter_error))
            }
        }
    }

    /** Экспорт истории в CSV и шаринг через системный диалог. */
    fun exportCsv(onFileReady: (String) -> Unit) {
        viewModelScope.launch {
            try {
                emailRepository.exportCsv(account = null)
                onFileReady("temp_emails_export.csv")
                _events.send(HistoryEvent.Message(com.tempgmail.app.R.string.history_export_done))
            } catch (e: Exception) {
                Timber.e(e, "exportCsv failed")
                _events.send(HistoryEvent.Message(com.tempgmail.app.R.string.error_generic))
            }
        }
    }
}
