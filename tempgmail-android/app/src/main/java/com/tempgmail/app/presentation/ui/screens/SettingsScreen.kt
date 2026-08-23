package com.tempgmail.app.presentation.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tempgmail.app.R
import com.tempgmail.app.domain.model.AppTheme
import com.tempgmail.app.presentation.viewmodel.SettingsEvent
import com.tempgmail.app.presentation.viewmodel.SettingsViewModel
import kotlinx.coroutines.launch

/**
 * Экран настроек: тема, язык, параметры генерации меток,
 * автоочистка, аккаунты и импорт/экспорт настроек через SAF.
 */
@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val settings by viewModel.settings.collectAsState()
    val accounts by viewModel.accounts.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // SAF-ленчеры для экспорта/импорта настроек
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            val json = viewModel.exportJson()
            context.contentResolver.openOutputStream(uri)?.use { it.write(json.toByteArray()) }
        }
    }
    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val json = context.contentResolver.openInputStream(uri)
            ?.use { it.readBytes().decodeToString() }
        json?.let(viewModel::importJson)
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is SettingsEvent.Message -> snackbar.showSnackbar(context.getString(event.textRes))
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(stringResource(R.string.nav_settings), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))

        // ---------- Тема ----------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                val themes = listOf(AppTheme.LIGHT, AppTheme.DARK, AppTheme.SYSTEM)
                val labels = listOf(R.string.theme_light, R.string.theme_dark, R.string.theme_system)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    themes.forEachIndexed { index, theme ->
                        SegmentedButton(
                            selected = settings.theme == theme,
                            onClick = { viewModel.setTheme(theme) },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = themes.size),
                        ) { Text(stringResource(labels[index])) }
                    }
                }

                Spacer(Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(Modifier.height(16.dp))

                // ---------- Язык ----------
                Text(stringResource(R.string.settings_language), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Row {
                    listOf("system" to "System", "ru" to "Русский", "en" to "English").forEach { (tag, label) ->
                        OutlinedButton(
                            onClick = { viewModel.setLanguage(tag) },
                            modifier = Modifier.padding(end = 8.dp),
                            enabled = settings.language.tag != tag,
                        ) { Text(label) }
                    }
                }
                // Переключение языка вступает в силу после перезапуска Activity
                // (либо подключите androidx.appcompat:appcompat + AppCompatDelegate.setApplicationLocales)
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---------- Генерация меток ----------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    stringResource(R.string.settings_label_length, settings.labelLength),
                    style = MaterialTheme.typography.titleMedium,
                )
                Slider(
                    value = settings.labelLength.toFloat(),
                    onValueChange = { viewModel.setLabelLength(it.toInt()) },
                    valueRange = 4f..16f,
                    steps = 11,
                )
                SettingSwitch(
                    title = stringResource(R.string.settings_use_letters),
                    checked = settings.useLetters,
                    onChange = viewModel::setUseLetters,
                )
                SettingSwitch(
                    title = stringResource(R.string.settings_use_digits),
                    checked = settings.useDigits,
                    onChange = viewModel::setUseDigits,
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---------- Автоочистка ----------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                SettingSwitch(
                    title = stringResource(R.string.settings_auto_cleanup),
                    checked = settings.autoCleanupEnabled,
                    onChange = viewModel::setAutoCleanup,
                )
                if (settings.autoCleanupEnabled) {
                    Text(
                        stringResource(R.string.settings_cleanup_days, settings.autoCleanupDays),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Slider(
                        value = settings.autoCleanupDays.toFloat(),
                        onValueChange = { viewModel.setCleanupDays(it.toInt()) },
                        valueRange = 1f..180f,
                        steps = 59,
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---------- Аккаунты ----------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.accounts_title), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                if (accounts.isEmpty()) {
                    Text(
                        stringResource(R.string.auth_required),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                accounts.forEach { account ->
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(account.email, style = MaterialTheme.typography.bodyLarge)
                            if (account.isActive) {
                                Text(
                                    stringResource(R.string.account_active),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                        if (!account.isActive) {
                            OutlinedButton(onClick = { viewModel.setActiveAccount(account.email) }) {
                                Text(stringResource(R.string.account_active))
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(onClick = { viewModel.removeAccount(account.email) }) {
                            Text(stringResource(R.string.account_sign_out))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        // ---------- Импорт/экспорт и о приложении ----------
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Row {
                    OutlinedButton(
                        onClick = { exportLauncher.launch("temp_gmail_settings.json") },
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(R.string.settings_export)) }
                    Spacer(Modifier.width(8.dp))
                    OutlinedButton(
                        onClick = { importLauncher.launch(arrayOf("application/json", "text/*")) },
                        modifier = Modifier.weight(1f),
                    ) { Text(stringResource(R.string.settings_import)) }
                }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(
                        R.string.settings_version,
                        runCatching {
                            context.packageManager
                                .getPackageInfo(context.packageName, 0).versionName ?: "1.0"
                        }.getOrDefault("1.0"),
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(32.dp))
    }

    androidx.compose.foundation.layout.Box(Modifier.fillMaxSize()) {
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

/** Переключатель с подписью — примитив для экрана настроек. */
@Composable
private fun SettingSwitch(title: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
