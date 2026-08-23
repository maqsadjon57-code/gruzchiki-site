package com.tempgmail.app.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.tempgmail.app.data.remote.GmailScopes
import com.tempgmail.app.data.repository.AccountRepository
import com.tempgmail.app.presentation.navigation.AppNavGraph
import com.tempgmail.app.presentation.ui.theme.TempGmailTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

/**
 * Единственная Activity приложения.
 *
 * Помимо Compose-контента здесь живёт флоу Google авторизации:
 * GoogleSignInClient с Gmail-scope'ами запускает системный экран
 * согласия; результат сохраняем в AccountRepository — экраны
 * подхватывают аккаунт реактивно через Room.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var accountRepository: AccountRepository

    /** Клиент Google Sign-In с запросом прав на фильтры/письма Gmail */
    private val googleSignInClient: GoogleSignInClient by lazy {
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestScopes(
                Scope(GmailScopes.SETTINGS_BASIC),
                Scope(GmailScopes.MODIFY),
            )
            .build()
        GoogleSignIn.getClient(this, options)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            // Современный способ ждать результат Sign-In интента (без onActivityResult)
            val signInLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.StartActivityForResult(),
            ) { result ->
                handleSignInResult(result.data)
            }

            val rootViewModel: com.tempgmail.app.presentation.viewmodel.RootViewModel =
                androidx.hilt.navigation.compose.hiltViewModel()
            val theme by rootViewModel.theme.collectAsState()

            TempGmailTheme(appTheme = theme) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNavGraph(onSignIn = {
                        signInLauncher.launch(googleSignInClient.signInIntent)
                    })
                }
            }
        }
    }

    /** Разбор результата Google Sign-In: сохраняем аккаунт в Room. */
    private fun handleSignInResult(data: android.content.Intent?) {
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            if (account?.email != null) {
                lifecycleScope.launch { accountRepository.onSignedIn(account) }
            }
        } catch (e: ApiException) {
            // statusCode 12501 = пользователь отменил; прочие — логируем
            Timber.w("Google sign-in failed, code=%d", e.statusCode)
        }
    }
}
