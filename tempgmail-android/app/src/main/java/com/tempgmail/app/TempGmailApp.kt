package com.tempgmail.app

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.tempgmail.app.worker.CleanupWorker
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Application-класс «Временный Gmail».
 * Здесь инициализируются Timber (логи) и периодическая автоочистка истории
 * через WorkManager (чистка сама проверит, включена ли она в настройках).
 */
@HiltAndroidApp
class TempGmailApp : Application() {

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        schedulePeriodicCleanup()
        // Firebase инициализируется автоматически при добавлении google-services.json
    }

    /** Периодическая очистка старых адресов (раз в сутки, гибкое окно 6 ч). */
    private fun schedulePeriodicCleanup() {
        val request = PeriodicWorkRequestBuilder<CleanupWorker>(1, TimeUnit.DAYS)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            CleanupWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
