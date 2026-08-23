package com.tempgmail.app.data.remote

import android.accounts.Account
import android.content.Context
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.GoogleSignIn
import com.google.android.gms.auth.UserRecoverableAuthException
import com.google.android.gms.common.api.Scope
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** OAuth-скоупы приложения (см. Google Cloud Console). */
object GmailScopes {
    const val SETTINGS_BASIC = "https://www.googleapis.com/auth/gmail.settings.basic"
    const val MODIFY = "https://www.googleapis.com/auth/gmail.modify"
    val ALL: Array<Scope> = arrayOf(Scope(SETTINGS_BASIC), Scope(MODIFY))
    val ALL_AS_STRING = "oauth2:$SETTINGS_BASIC $MODIFY"
}

/**
 * Поставщик OAuth access-токенов для вызовов Gmail API.
 *
 * Токен не сохраняется надолго: GoogleAuthUtil сам кэширует и обновляет
 * его через системный аккаунт Google. Это безопаснее, чем хранить
 * refresh-токен в приложении.
 */
@Singleton
class GoogleAuthTokenProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val mutex = Mutex()
    @Volatile private var cachedToken: String? = null
    @Volatile private var cachedForEmail: String? = null

    /**
     * Возвращает валидный access-токен для аккаунта [email].
     * @throws AuthRequiredException если Google требует подтверждение от пользователя
     *         (нужно показать экран авторизации/согласия).
     */
    suspend fun getToken(email: String): String = withContext(Dispatchers.IO) {
        if (cachedForEmail == email) {
            cachedToken?.let { return@withContext it }
        }
        mutex.withLock {
            if (cachedForEmail == email) {
                cachedToken?.let { return@withLock it }
            }
            try {
                val token = GoogleAuthUtil.getToken(
                    context,
                    Account(email, GoogleAuthUtil.GOOGLE_ACCOUNT_TYPE),
                    GmailScopes.ALL_AS_STRING,
                )
                cachedToken = token
                cachedForEmail = email
                Timber.d("OAuth token received for %s", email)
                token
            } catch (e: UserRecoverableAuthException) {
                // Пользователь должен вручную подтвердить доступ — пробрасываем наверх
                Timber.w("User recoverable auth required: %s", e.message)
                cachedToken = null
                throw AuthRequiredException(e)
            } catch (e: Exception) {
                Timber.e(e, "Failed to get OAuth token")
                cachedToken = null
                throw e
            }
        }
    }

    /** Сбрасывает кэшированный токен (после 401 — чтобы выкинуть протухший). */
    fun invalidate() {
        val token = cachedToken
        cachedToken = null
        if (token != null) {
            Thread { runCatching { GoogleAuthUtil.clearToken(context, token) } }.start()
        }
    }

    /** Есть ли у Google-аккаунта [email] наши scope (без запроса токена). */
    fun hasScopes(email: String): Boolean {
        val account = GoogleSignIn.getLastSignedInAccount(context) ?: return false
        if (account.email != email) return false
        return GmailScopes.ALL.all { GoogleSignIn.hasPermissions(account, it) }
    }
}

/**
 * Исключение: требуется ручное подтверждение доступа пользователем.
 * Presentation-слой должен показать GoogleSignIn-флоу.
 */
class AuthRequiredException(
    val userRecoverable: UserRecoverableAuthException? = null,
) : Exception("Manual user authorization required")
