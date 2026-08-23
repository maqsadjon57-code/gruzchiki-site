package com.tempgmail.app.data.local.entities

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.tempgmail.app.domain.model.TemporaryEmail

/**
 * Room-сущность таблицы temporary_emails — сгенерированные временные адреса.
 */
@Entity(
    tableName = "temporary_emails",
    indices = [
        Index("main_email"),
        Index(value = ["full_email"], unique = true),
    ],
)
data class TemporaryEmailEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val main_email: String,
    val label: String,
    val full_email: String,
    val created_at: Long,
    val is_active: Boolean,
    val filter_id: String? = null,
    val notes: String? = null,
    val site: String? = null,
)

/** Мапперы Entity <-> Domain, чтобы не протягивать Room-типы выше data-слоя. */
fun TemporaryEmailEntity.toDomain() = TemporaryEmail(
    id = id,
    mainEmail = main_email,
    label = label,
    fullEmail = full_email,
    createdAt = created_at,
    isActive = is_active,
    filterId = filter_id,
    notes = notes,
    site = site,
)

fun TemporaryEmail.toEntity() = TemporaryEmailEntity(
    id = id,
    main_email = mainEmail,
    label = label,
    full_email = fullEmail,
    created_at = createdAt,
    is_active = isActive,
    filter_id = filterId,
    notes = notes,
    site = site,
)
