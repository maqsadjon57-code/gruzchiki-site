package com.tempgmail.app.data.repository

import android.content.Context
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.tempgmail.app.data.local.dao.AccountDao
import com.tempgmail.app.data.local.entities.AccountEntity
import com.tempgmail.app.data.local.entities.toDomain
import com.tempgmail.app.domain.model.AccountInfo
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/** Репозиторий аккаунтов Google: добавление после Sign-In, выбор активного, выход. */
@Singleton
class AccountRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val accountDao: AccountDao,
) {

    fun observeAccounts(): Flow<List<AccountInfo>> =
        accountDao.observeAll().map { list -> list.map { it.toDomain() } }

    fun observeActive(): Flow<AccountInfo?> =
        accountDao.observeActive().map { it?.toDomain() }

    suspend fun getActive(): AccountInfo? = withContext(Dispatchers.IO) {
        accountDao.getActive()?.toDomain()
    }

    /** Сохраняет аккаунт после успешного Google Sign-In и делает его активным. */
    suspend fun onSignedIn(account: GoogleSignInAccount) = withContext(Dispatchers.IO) {
        val email = account.email ?: return@withContext
        accountDao.insert(
            AccountEntity(
                email = email,
                display_name = account.displayName,
                is_active = false,
            )
        )
        accountDao.setOnlyActive(email)
    }

    /** Переключает активный аккаунт. */
    suspend fun setActive(email: String) = withContext(Dispatchers.IO) {
        accountDao.setOnlyActive(email)
    }

    /** Удаляет аккаунт из приложения (данные истории сохраняются). */
    suspend fun remove(email: String) = withContext(Dispatchers.IO) {
        accountDao.delete(email)
        // Если аккаунтов не осталось — чистим последний Google Sign-In локально
        if (accountDao.count() == 0) {
            GoogleSignIn.getLastSignedInAccount(context) ?: return@withContext
            // Полный sign-out из Google на устройстве выполняется в UI через клиента
        }
    }

    /** Последний залогиненный Google-аккаунт (без синхронизации с БД). */
    fun lastGoogleAccount(): GoogleSignInAccount? = GoogleSignIn.getLastSignedInAccount(context)
}
