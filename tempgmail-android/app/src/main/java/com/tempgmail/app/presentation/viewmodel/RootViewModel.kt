package com.tempgmail.app.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tempgmail.app.data.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel корня приложения: отдаёт тему для обёртки и флаг онбординга.
 * Лёгкая — вся рабочая логика в экранных ViewModel.
 */
@HiltViewModel
class RootViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
) : ViewModel() {

    /** null — ещё не загружено; true/false — флаг из БД */
    val onboardingCompleted: StateFlow<Boolean?> = settingsRepository.observe()
        .map { it.onboardingCompleted }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val theme: StateFlow<com.tempgmail.app.domain.model.AppTheme> = settingsRepository.observe()
        .map { it.theme }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000),
            com.tempgmail.app.domain.model.AppTheme.SYSTEM)

    fun completeOnboarding() {
        viewModelScope.launch { settingsRepository.completeOnboarding() }
    }
}
