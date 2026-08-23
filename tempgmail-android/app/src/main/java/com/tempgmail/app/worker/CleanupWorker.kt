package com.tempgmail.app.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tempgmail.app.data.repository.SettingsRepository
import com.tempgmail.app.data.repository.TempEmailRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import timber.log.Timber

/**
 * Периодический воркер автоочистки: удаляет адреса старше N дней,
 * если функция включена в настройках. Срабатывает раз в сутки.
 */
@HiltWorker
class CleanupWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val settingsRepository: SettingsRepository,
    private val emailRepository: TempEmailRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val settings = settingsRepository.get()
            if (!settings.autoCleanupEnabled) {
                Timber.d("Auto cleanup disabled, skipping")
                return Result.success()
            }
            val removed = emailRepository.cleanupOlderThan(settings.autoCleanupDays)
            Timber.i("Auto cleanup removed %d old emails", removed)
            Result.success()
        } catch (t: Throwable) {
            Timber.e(t, "Cleanup worker failed")
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val WORK_NAME = "temp_gmail_cleanup"
    }
}
