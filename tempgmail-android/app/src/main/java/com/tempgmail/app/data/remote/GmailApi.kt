package com.tempgmail.app.data.remote

import com.tempgmail.app.data.remote.dto.FilterListResponseDto
import com.tempgmail.app.data.remote.dto.GmailFilterDto
import com.tempgmail.app.data.remote.dto.MessageListResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit-интерфейс Gmail API v1.
 * Документация: https://developers.google.com/gmail/api/reference/rest
 *
 * Требуемые OAuth scope:
 *  - https://www.googleapis.com/auth/gmail.settings.basic (фильтры)
 *  - https://www.googleapis.com/auth/gmail.modify (счётчик писем)
 */
interface GmailApi {

    /** Создать фильтр от имени пользователя ("me" = владелец токена). */
    @POST("gmail/v1/users/me/settings/filters")
    suspend fun createFilter(@Body filter: GmailFilterDto): Response<GmailFilterDto>

    /** Список всех фильтров аккаунта. */
    @GET("gmail/v1/users/me/settings/filters")
    suspend fun listFilters(): Response<FilterListResponseDto>

    /** Удалить фильтр по ID. При успехе возвращается 204 No Content. */
    @DELETE("gmail/v1/users/me/settings/filters/{id}")
    suspend fun deleteFilter(@Path("id") filterId: String): Response<Unit>

    /**
     * Поиск писем. Используем для счётчика «сколько писем пришло
     * на адрес» — берём только resultSizeEstimate, страницы не гоняем.
     */
    @GET("gmail/v1/users/me/messages")
    suspend fun listMessages(
        @Query("q") query: String,
        @Query("maxResults") maxResults: Int = 1,
    ): Response<MessageListResponseDto>
}
