package com.tempgmail.app.data.local.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.tempgmail.app.domain.model.FilterAction
import com.tempgmail.app.domain.model.FilterInfo

/**
 * Room-сущность таблицы filters — фильтры Gmail, созданные приложением.
 * Каскадно удаляется вместе с временным адресом.
 */
@Entity(
    tableName = "filters",
    foreignKeys = [
        ForeignKey(
            entity = TemporaryEmailEntity::class,
            parentColumns = ["id"],
            childColumns = ["email_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("email_id")],
)
data class FilterEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val email_id: Long,
    val gmail_filter_id: String? = null,
    val action_type: String,
    val filter_query: String,
    val is_enabled: Boolean,
)

fun FilterEntity.toDomain() = FilterInfo(
    id = id,
    emailId = email_id,
    gmailFilterId = gmail_filter_id,
    action = runCatching { FilterAction.valueOf(action_type) }.getOrDefault(FilterAction.DEFAULT),
    query = filter_query,
    isEnabled = is_enabled,
)

fun FilterInfo.toEntity() = FilterEntity(
    id = id,
    email_id = emailId,
    gmail_filter_id = gmailFilterId,
    action_type = action.name,
    filter_query = query,
    is_enabled = isEnabled,
)
