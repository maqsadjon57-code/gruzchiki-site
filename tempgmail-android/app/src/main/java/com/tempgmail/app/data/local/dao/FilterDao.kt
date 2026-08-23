package com.tempgmail.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tempgmail.app.data.local.entities.FilterEntity
import kotlinx.coroutines.flow.Flow

/** DAO фильтров Gmail, созданных приложением. */
@Dao
interface FilterDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: FilterEntity): Long

    @Query("SELECT * FROM filters WHERE email_id = :emailId LIMIT 1")
    suspend fun getByEmailId(emailId: Long): FilterEntity?

    @Query("SELECT * FROM filters ORDER BY id DESC")
    fun observeAll(): Flow<List<FilterEntity>>

    @Query("UPDATE filters SET is_enabled = :enabled WHERE id = :id")
    suspend fun setEnabled(id: Long, enabled: Boolean)

    @Query("DELETE FROM filters WHERE email_id = :emailId")
    suspend fun deleteByEmailId(emailId: Long)
}
