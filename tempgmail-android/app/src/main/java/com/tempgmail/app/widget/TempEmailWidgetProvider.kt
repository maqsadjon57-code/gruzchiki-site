package com.tempgmail.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.tempgmail.app.R

/**
 * Виджет рабочего стола: показывает последний сгенерированный адрес
 * и кнопки «Создать» (открыть приложение) / «Копировать» (в буфер обмена).
 *
 * Данные берутся из SharedPreferences, куда их пишет экран генерации —
 * так виджет обновляется мгновенно и не блокируется на Room.
 */
class TempEmailWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> updateSingle(context, manager, id) }
    }

    companion object {
        private const val PREFS = "widget_state"
        private const val KEY_LAST_EMAIL = "last_email"
        const val ACTION_COPY = "com.tempgmail.app.widget.ACTION_COPY"
        const val ACTION_GENERATE = "com.tempgmail.app.action.GENERATE"

        /** Вызывается из экрана генерации, чтобы виджет показывал свежий адрес. */
        fun setLastEmail(context: Context, fullEmail: String) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_LAST_EMAIL, fullEmail).apply()
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                android.content.ComponentName(context, TempEmailWidgetProvider::class.java)
            )
            ids.forEach { updateSingle(context, manager, it) }
        }

        private fun lastEmail(context: Context): String? =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_LAST_EMAIL, null)

        private fun updateSingle(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_temp_email)
            views.setTextViewText(
                R.id.widget_email,
                lastEmail(context) ?: context.getString(R.string.widget_no_email)
            )

            // Кнопка «Создать» открывает приложение на экране генерации
            val openIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply { action = ACTION_GENERATE; addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            views.setOnClickPendingIntent(
                R.id.widget_btn_generate,
                PendingIntent.getActivity(
                    context, 1, openIntent ?: Intent(),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            // Кнопка «Копировать» шлёт broadcast самому провайдеру
            val copyIntent = Intent(context, TempEmailWidgetProvider::class.java)
                .setAction(ACTION_COPY)
            views.setOnClickPendingIntent(
                R.id.widget_btn_copy,
                PendingIntent.getBroadcast(
                    context, 2, copyIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            manager.updateAppWidget(widgetId, views)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_COPY) {
            val email = lastEmail(context) ?: return
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE)
                as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("temp_email", email))
        }
    }
}
