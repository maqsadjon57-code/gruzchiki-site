package com.tempgmail.app.presentation.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tempgmail.app.R
import com.tempgmail.app.domain.model.FilterAction
import com.tempgmail.app.presentation.viewmodel.HomeEvent
import com.tempgmail.app.presentation.viewmodel.HomeViewModel
import com.tempgmail.app.util.QrCodeUtils

/**
 * Главный экран: ввод основного адреса, генерация временного адреса,
 * результат с копированием, QR-кодом и созданием фильтра.
 * @param onSignIn запускает Google Sign-In (из MainActivity)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onSignIn: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsState()
    val accounts by viewModel.accounts.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    var showFilterDialog by remember { mutableStateOf(false) }
    var showQrDialog by remember { mutableStateOf(false) }
    var showInstruction by remember { mutableStateOf(false) }

    // Одноразовые события -> Snackbar / авторизация
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is HomeEvent.Message -> snackbar.showSnackbar(
                    event.arg?.let { context.getString(event.textRes, it) }
                        ?: context.getString(event.textRes)
                )
                // Нужна авторизация в Google — просим системный флоу
                HomeEvent.AuthRequired -> {
                    snackbar.showSnackbar(context.getString(R.string.auth_required))
                    onSignIn()
                }
            }
        }
    }

    // Перепроверяем доступ при возвращении на экран (после флоу авторизации)
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, e ->
            if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) viewModel.refreshAuthorization()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(24.dp))

            // ----------- Основной адрес: выбор аккаунта или ввод вручную -----------
            if (accounts.isNotEmpty()) {
                var expanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = ui.mainEmailInput,
                        onValueChange = viewModel::onMainEmailChange,
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        label = { Text(stringResource(R.string.main_email_hint)) },
                        leadingIcon = { Icon(Icons.Default.AlternateEmail, null) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        singleLine = true,
                        readOnly = false,
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        accounts.forEach { account ->
                            DropdownMenuItem(
                                text = { Text(account.email) },
                                onClick = {
                                    viewModel.onMainEmailChange(account.email)
                                    expanded = false
                                },
                            )
                        }
                    }
                }
            } else {
                OutlinedTextField(
                    value = ui.mainEmailInput,
                    onValueChange = viewModel::onMainEmailChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.main_email_hint)) },
                    leadingIcon = { Icon(Icons.Default.AlternateEmail, null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                )
            }
            Spacer(Modifier.height(12.dp))

            // ----------- Пользовательская метка (по желанию) -----------
            OutlinedTextField(
                value = ui.customLabelInput,
                onValueChange = viewModel::onCustomLabelChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.custom_label_hint)) },
                singleLine = true,
            )
            Spacer(Modifier.height(12.dp))

            // ----------- Название сайта для умной метки -----------
            OutlinedTextField(
                value = ui.siteInput,
                onValueChange = viewModel::onSiteChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.site_hint)) },
                singleLine = true,
            )
            Spacer(Modifier.height(20.dp))

            // ----------- Кнопка генерации -----------
            Button(
                onClick = viewModel::generate,
                enabled = !ui.generating,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                if (ui.generating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Icon(Icons.Default.AddCircle, null)
                    Spacer(Modifier.size(8.dp))
                    Text(stringResource(R.string.btn_generate))
                }
            }
            Spacer(Modifier.height(24.dp))

            // ----------- Результат: анимированная карточка с адресом -----------
            AnimatedVisibility(
                visible = ui.generated != null,
                enter = fadeIn() + scaleIn(initialScale = 0.92f),
            ) {
                ui.generated?.let { email ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                text = stringResource(R.string.generated_title),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = email.fullEmail,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(12.dp))
                            HorizontalDivider()
                            Spacer(Modifier.height(4.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                            ) {
                                // Копировать в буфер обмена
                                TextButton(onClick = {
                                    val cm = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                                        as android.content.ClipboardManager
                                    cm.setPrimaryClip(
                                        android.content.ClipData.newPlainText("temp_email", email.fullEmail)
                                    )
                                }) {
                                    Icon(Icons.Default.ContentCopy, null)
                                    Spacer(Modifier.size(4.dp))
                                    Text(stringResource(R.string.btn_copy))
                                }
                                // QR-код
                                TextButton(onClick = { showQrDialog = true }) {
                                    Icon(Icons.Default.QrCode2, null)
                                    Spacer(Modifier.size(4.dp))
                                    Text(stringResource(R.string.btn_show_qr))
                                }
                                // Ещё один адрес
                                TextButton(onClick = viewModel::generate) {
                                    Icon(Icons.Default.Refresh, null)
                                    Spacer(Modifier.size(4.dp))
                                    Text(stringResource(R.string.btn_generate_another))
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(20.dp))

            // ----------- Вход через Google (нужен для автофильтров) -----------
            if (!ui.isAuthorizedForApi) {
                OutlinedButton(
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.sign_in_google))
                }
                Spacer(Modifier.height(12.dp))
            }

            // ----------- Фильтр в Gmail или инструкция -----------
            if (ui.generated != null) {
                if (ui.isAuthorizedForApi) {
                    Button(
                        onClick = { showFilterDialog = true },
                        enabled = !ui.filterInProgress,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.FilterAlt, null)
                        Spacer(Modifier.size(8.dp))
                        Text(
                            if (ui.filterInProgress) "…"
                            else stringResource(R.string.btn_create_filter)
                        )
                    }
                } else {
                    OutlinedButton(
                        onClick = { showInstruction = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.btn_show_instruction))
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    // ----------- Диалог выбора действия фильтра -----------
    if (showFilterDialog) {
        AlertDialog(
            onDismissRequest = { showFilterDialog = false },
            title = { Text(stringResource(R.string.filter_title)) },
            text = {
                Column {
                    FilterAction.entries.forEach { action ->
                        val label = when (action) {
                            FilterAction.DELETE -> R.string.filter_delete
                            FilterAction.ARCHIVE -> R.string.filter_archive
                            FilterAction.MARK_READ -> R.string.filter_mark_read
                            FilterAction.APPLY_LABEL -> R.string.filter_label
                            FilterAction.SPAM -> R.string.filter_spam
                        }
                        TextButton(
                            onClick = {
                                showFilterDialog = false
                                viewModel.createGmailFilter(action)
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(label), modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showFilterDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    // ----------- Диалог с QR-кодом адреса -----------
    if (showQrDialog && ui.generated != null) {
        val email = ui.generated!!.fullEmail
        AlertDialog(
            onDismissRequest = { showQrDialog = false },
            title = { Text(stringResource(R.string.qr_dialog_title)) },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Image(
                        bitmap = QrCodeUtils.generate(email).asImageBitmap(),
                        contentDescription = "QR",
                        modifier = Modifier.size(220.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(email, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = { showQrDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    // ----------- Инструкция по ручной настройке фильтра -----------
    if (showInstruction && ui.generated != null) {
        val email = ui.generated!!.fullEmail
        AlertDialog(
            onDismissRequest = { showInstruction = false },
            title = { Text(stringResource(R.string.instruction_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.instruction_step_1))
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.instruction_step_2))
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "to:($email)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.instruction_step_3))
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.instruction_step_4))
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.instruction_done))
                }
            },
            confirmButton = {
                TextButton(onClick = { showInstruction = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}
