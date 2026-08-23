package com.tempgmail.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.tempgmail.app.data.local.entities.TemporaryEmailEntity
import kotlinx.coroutines.flow.Flow

/** DAO временных адресов: история, поиск, статус, очистка. */
@Dao
interface TempEmailDao {

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: TemporaryEmailEntity): Long

    @Update
    suspend fun update(entity: TemporaryEmailEntity)

    @Query("UPDATE temporary_emails SET is_active = :isActive WHERE id = :id")
    suspend fun setActive(id: Long, isActive: Boolean)

    @Query("UPDATE temporary_emails SET filter_id = :filterId WHERE id = :id")
    suspend fun setFilterId(id: Long, filterId: String?)

    @Query("DELETE FROM temporary_emails WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("SELECT * FROM temporary_emails WHERE id = :id")
    suspend fun getById(id: Long): TemporaryEmailEntity?

    @Query("SELECT * FROM temporary_emails WHERE full_email = :fullEmail LIMIT 1")
    suspend fun findByFullEmail(fullEmail: String): TemporaryEmailEntity?

    /** Все адреса (для очистки/синка) */
    @Query("SELECT * FROM temporary_emails ORDER BY created_at DESC")
    suspend fun getAllOnce(): List<TemporaryEmailEntity>

    /** Реактивная история с фильтрами: по аккаунту, поисковому запросу и статусу. */
    @Query(
        """
        SELECT * FROM temporary_emails
        WHERE (:account IS NULL OR main_email = :account)
          AND (:query = '' OR full_email LIKE '%' || :query || '%' OR label LIKE '%' || :query || '%')
          AND (:status IS NULL OR is_active = :status)
        ORDER BY created_at DESC
        """
    )
    fun observeHistory(account: String?, query: String, status: Boolean?): Flow<List<TemporaryEmailEntity>>

    /** Удаление адресов старше заданного времени (автоочистка). Возвращает число удалённых. */
    @Query("DELETE FROM temporary_emails WHERE created_at < :olderThan")
    suspend fun deleteOlderThan(olderThan: Long): Int

    @Query("SELECT * FROM temporary_emails ORDER BY created_at DESC LIMIT 1")
    suspend fun getLatest(): TemporaryEmailEntity?
}
