package com.tempgmail.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.tempgmail.app.data.local.dao.AccountDao
import com.tempgmail.app.data.local.dao.FilterDao
import com.tempgmail.app.data.local.dao.SettingsDao
import com.tempgmail.app.data.local.dao.TempEmailDao
import com.tempgmail.app.data.local.entities.AccountEntity
import com.tempgmail.app.data.local.entities.FilterEntity
import com.tempgmail.app.data.local.entities.SettingsEntity
import com.tempgmail.app.data.local.entities.TemporaryEmailEntity

/**
 * Единая база Room приложения.
 * Версию бьём при изменении схем + добавляем миграции в AppModule.
 */
@Database(
    entities = [
        TemporaryEmailEntity::class,
        FilterEntity::class,
        AccountEntity::class,
        SettingsEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tempEmailDao(): TempEmailDao
    abstract fun filterDao(): FilterDao
    abstract fun accountDao(): AccountDao
    abstract fun settingsDao(): SettingsDao

    companion object {
        const val NAME = "temp_gmail.db"
    }
}
