package com.tempgmail.app.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO модели Gmail API v1 (users.settings.filters и users.messages).
 * Поля названы в соответствии с JSON-документацией Google и не обфусцируются
 * (см. proguard-rules.pro).
 */

/** Критерии фильтра: на какие письма он срабатывает. */
data class FilterCriteriaDto(
    @SerializedName("to") val to: String? = null,
    @SerializedName("from") val from: String? = null,
    @SerializedName("subject") val subject: String? = null,
    @SerializedName("query") val query: String? = null,
    @SerializedName("negatedQuery") val negatedQuery: String? = null,
    @SerializedName("hasAttachment") val hasAttachment: Boolean? = null,
    @SerializedName("size") val size: Long? = null,
    @SerializedName("sizeComparison") val sizeComparison: String? = null,
)

/** Действие фильтра: добавить/снять ярлыки, переслать. */
data class FilterActionDto(
    @SerializedName("addLabelIds") val addLabelIds: List<String>? = null,
    @SerializedName("removeLabelIds") val removeLabelIds: List<String>? = null,
    @SerializedName("forward") val forward: String? = null,
)

/** Фильтр Gmail целиком (и для создания, и для чтения). */
data class GmailFilterDto(
    @SerializedName("id") val id: String? = null,
    @SerializedName("criteria") val criteria: FilterCriteriaDto,
    @SerializedName("action") val action: FilterActionDto,
)

/** Ответ GET .../settings/filters */
data class FilterListResponseDto(
    @SerializedName("filter") val filters: List<GmailFilterDto>? = null,
)

/** Краткое описание письма в выдаче */
data class MessageRefDto(
    @SerializedName("id") val id: String,
    @SerializedName("threadId") val threadId: String,
)

/** Ответ GET .../messages (используем только resultSizeEstimate для счётчика) */
data class MessageListResponseDto(
    @SerializedName("messages") val messages: List<MessageRefDto>? = null,
    @SerializedName("nextPageToken") val nextPageToken: String? = null,
    @SerializedName("resultSizeEstimate") val resultSizeEstimate: Int = 0,
)
