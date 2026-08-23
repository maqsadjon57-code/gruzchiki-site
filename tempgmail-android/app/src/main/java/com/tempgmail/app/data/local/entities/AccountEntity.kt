package com.tempgmail.app.data.local.entities

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.tempgmail.app.domain.model.AccountInfo

/** Room-сущность таблицы accounts — сохранённые Gmail-аккаунты. */
@Entity(tableName = "accounts", indices = [Index(value = ["email"], unique = true)])
data class AccountEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val email: String,
    val display_name: String? = null,
    val is_active: Boolean = false,
)

fun AccountEntity.toDomain() =
    AccountInfo(id = id, email = email, displayName = display_name, isActive = is_active)

fun AccountInfo.toEntity() =
    AccountEntity(id = id, email = email, display_name = displayName, is_active = isActive)
