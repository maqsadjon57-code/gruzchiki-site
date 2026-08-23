package com.tempgmail.app.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tempgmail.app.data.remote.GoogleAuthTokenProvider
import com.tempgmail.app.data.repository.AccountRepository
import com.tempgmail.app.domain.model.AccountInfo
import com.tempgmail.app.domain.model.FilterAction
import com.tempgmail.app.domain.model.TemporaryEmail
import com.tempgmail.app.domain.usecase.CreateFilterUseCase
import com.tempgmail.app.domain.usecase.GenerateEmailUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * UI-состояние главного экрана генерации.
 */
data class HomeUiState(
    /** Введённый вручную основной адрес (если аккаунтов нет) */
    val mainEmailInput: String = "",
    /** Пользовательская метка (по желанию) */
    val customLabelInput: String = "",
    /** Название сайта для умной метки */
    val siteInput: String = "",
    /** Текущий сгенерированный адрес (null — ещё не генерировали) */
    val generated: TemporaryEmail? = null,
    /** Идёт ли генерация прямо сейчас (спиннер на кнопке) */
    val generating: Boolean = false,
    /** Идёт ли создание фильтра */
    val filterInProgress: Boolean = false,
    /** Авторизован ли активный аккаунт для Gmail API */
    val isAuthorizedForApi: Boolean = false,
)

/**
 * Одноразовые события экрана (Snackbar, диалоги) — доставляются один раз.
 */
sealed interface HomeEvent {
    data class Message(val textRes: Int, val arg: String? = null) : HomeEvent
    object AuthRequired : HomeEvent
}

/** ViewModel главного экрана: генерация адресов, создание фильтров. */
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val generateEmail: GenerateEmailUseCase,
    private val createFilter: CreateFilterUseCase,
    private val accountRepository: AccountRepository,
    private val tokenProvider: GoogleAuthTokenProvider,
) : ViewModel() {

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    private val _events = Channel<HomeEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    /** Список аккаунтов для выпадающего выбора основного адреса. */
    val accounts: StateFlow<List<AccountInfo>> = accountRepository.observeAccounts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Активный аккаунт — подставляем в поле ввода. */
    val activeAccount = accountRepository.observeActive()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        // Когда появляется активный аккаунт — синхронизируем поле и авторизацию
        viewModelScope.launch {
            activeAccount.collect { acc ->
                if (acc != null) {
                    _ui.value = _ui.value.copy(
                        mainEmailInput = acc.email,
                        isAuthorizedForApi = tokenProvider.hasScopes(acc.email),
                    )
                }
            }
        }
    }

    fun onMainEmailChange(value: String) {
        _ui.value = _ui.value.copy(mainEmailInput = value)
    }

    fun onCustomLabelChange(value: String) {
        _ui.value = _ui.value.copy(customLabelInput = value)
    }

    fun onSiteChange(value: String) {
        _ui.value = _ui.value.copy(siteInput = value)
    }

    /** Генерация нового временного адреса. */
    fun generate() {
        val state = _ui.value
        if (state.generating) return
        _ui.value = state.copy(generating = true)
        viewModelScope.launch {
            val effectiveSite = state.siteInput.ifBlank { null }
            val result = generateEmail(
                mainEmail = state.mainEmailInput,
                customLabel = state.customLabelInput.ifBlank { null },
                site = effectiveSite,
            )
            _ui.value = _ui.value.copy(generating = false)
            when (result) {
                is GenerateEmailUseCase.Result.Success -> {
                    _ui.value = _ui.value.copy(
                        generated = result.email,
                        customLabelInput = "",
                        siteInput = "",
                    )
                    _events.send(HomeEvent.Message(com.tempgmail.app.R.string.generated_title))
                }
                is GenerateEmailUseCase.Result.Error -> {
                    val res = when (result.reason) {
                        GenerateEmailUseCase.Reason.INVALID_GMAIL ->
                            com.tempgmail.app.R.string.error_invalid_email
                        GenerateEmailUseCase.Reason.INVALID_LABEL ->
                            com.tempgmail.app.R.string.error_label_chars
                        else -> com.tempgmail.app.R.string.error_generic
                    }
                    _events.send(HomeEvent.Message(res))
                }
            }
        }
    }

    /** Создание фильтра в Gmail для последнего сгенерированного адреса. */
    fun createGmailFilter(action: FilterAction) {
        val email = _ui.value.generated ?: return
        if (_ui.value.filterInProgress) return
        _ui.value = _ui.value.copy(filterInProgress = true)
        viewModelScope.launch {
            when (val result = createFilter(email, action)) {
                is CreateFilterUseCase.Result.Success -> {
                    _ui.value = _ui.value.copy(
                        filterInProgress = false,
                        generated = email.copy(filterId = result.filter.gmailFilterId),
                    )
                    _events.send(HomeEvent.Message(com.tempgmail.app.R.string.filter_created))
                }
                CreateFilterUseCase.Result.AuthRequired -> {
                    _ui.value = _ui.value.copy(
                        filterInProgress = false,
                        isAuthorizedForApi = false,
                    )
                    _events.send(HomeEvent.AuthRequired)
                }
                is CreateFilterUseCase.Result.ApiError -> {
                    Timber.e("Filter API error %d: %s", result.code, result.message)
                    _ui.value = _ui.value.copy(filterInProgress = false)
                    _events.send(
                        HomeEvent.Message(com.tempgmail.app.R.string.filter_error, "${result.code}")
                    )
                }
                is CreateFilterUseCase.Result.Unknown -> {
                    Timber.e(result.throwable, "Filter unknown error")
                    _ui.value = _ui.value.copy(filterInProgress = false)
                    _events.send(HomeEvent.Message(com.tempgmail.app.R.string.error_no_internet))
                }
            }
        }
    }

    /** Пометить, что OAuth-доступ получен (после флоу авторизации). */
    fun onAuthorized() {
        _ui.value = _ui.value.copy(isAuthorizedForApi = true)
    }

    /** Перепроверить наличие scope у активного аккаунта (вызывается на ON_RESUME). */
    fun refreshAuthorization() {
        val email = activeAccount.value?.email ?: return
        _ui.value = _ui.value.copy(isAuthorizedForApi = tokenProvider.hasScopes(email))
    }
}
