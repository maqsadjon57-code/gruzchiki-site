package com.tempgmail.app.data.remote

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * OkHttp-интерцептор: подставляет заголовок Authorization: Bearer <token>
 * для запросов к gmail.googleapis.com.
 *
 * Почему runBlocking здесь допустим: OkHttp сам выполняет запросы
 * в IO-потоках своего пула — главный поток не блокируется.
 */
class AuthInterceptor(
    private val tokenProvider: GoogleAuthTokenProvider,
    private val activeAccountProvider: () -> String?,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val email = activeAccountProvider()
            ?: return chain.proceed(request) // без аккаунта — анонимный запрос (упадёт 401)

        val token = runBlocking { tokenProvider.getToken(email) }
        val authed = request.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        val response = chain.proceed(authed)

        // Протухший токен — сбрасываем кэш, следующий запрос получит новый
        if (response.code == 401) {
            tokenProvider.invalidate()
        }
        return response
    }
}
