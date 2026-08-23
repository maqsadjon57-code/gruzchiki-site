package com.tempgmail.app.di

import android.content.Context
import androidx.room.Room
import com.tempgmail.app.data.local.AppDatabase
import com.tempgmail.app.data.local.dao.AccountDao
import com.tempgmail.app.data.local.dao.FilterDao
import com.tempgmail.app.data.local.dao.SettingsDao
import com.tempgmail.app.data.local.dao.TempEmailDao
import com.tempgmail.app.data.remote.AuthInterceptor
import com.tempgmail.app.data.remote.GmailApi
import com.tempgmail.app.data.remote.GoogleAuthTokenProvider
import com.tempgmail.app.data.repository.AccountRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Корневой Hilt-модуль приложения: база данных, DAO, сеть.
 * Всё синглтоны — живут столько же, сколько процесс приложения.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    // ---------- Room ----------

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, AppDatabase.NAME)
            .fallbackToDestructiveMigration() // для MVP; в проде — явные миграции
            .build()

    @Provides fun provideTempEmailDao(db: AppDatabase): TempEmailDao = db.tempEmailDao()
    @Provides fun provideFilterDao(db: AppDatabase): FilterDao = db.filterDao()
    @Provides fun provideAccountDao(db: AppDatabase): AccountDao = db.accountDao()
    @Provides fun provideSettingsDao(db: AppDatabase): SettingsDao = db.settingsDao()

    // ---------- Сеть (Gmail API) ----------

    @Provides
    @Singleton
    fun provideOkHttpClient(
        tokenProvider: GoogleAuthTokenProvider,
        accountRepository: dagger.Lazy<AccountRepository>,
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
            // никогда не логируем Authorization — там токен!
            redactHeader("Authorization")
        }
        val authInterceptor = AuthInterceptor(tokenProvider) {
            // Текущий активный аккаунт на момент запроса
            runBlocking { accountRepository.get().getActive()?.email }
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://gmail.googleapis.com/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideGmailApi(retrofit: Retrofit): GmailApi = retrofit.create(GmailApi::class.java)
}
