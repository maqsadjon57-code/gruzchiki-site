package com.tempgmail.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tempgmail.app.data.local.entities.AccountEntity
import kotlinx.coroutines.flow.Flow

/** DAO аккаунтов: добавление, выбор активного, удаление. */
@Dao
interface AccountDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: AccountEntity): Long

    @Query("SELECT * FROM accounts ORDER BY id ASC")
    fun observeAll(): Flow<List<AccountEntity>>

    @Query("SELECT * FROM accounts WHERE is_active = 1 LIMIT 1")
    fun observeActive(): Flow<AccountEntity?>

    @Query("SELECT * FROM accounts WHERE is_active = 1 LIMIT 1")
    suspend fun getActive(): AccountEntity?

    /** Делает указанный аккаунт активным, сбрасывая остальные. */
    @Query("UPDATE accounts SET is_active = (email = :email)")
    suspend fun setOnlyActive(email: String)

    @Query("DELETE FROM accounts WHERE email = :email")
    suspend fun delete(email: String)

    @Query("SELECT COUNT(*) FROM accounts")
    suspend fun count(): Int
}
