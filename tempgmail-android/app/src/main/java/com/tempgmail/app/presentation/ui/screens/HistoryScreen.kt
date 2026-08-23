package com.tempgmail.app.presentation.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tempgmail.app.R
import com.tempgmail.app.domain.model.TemporaryEmail
import com.tempgmail.app.presentation.viewmodel.HistoryEvent
import com.tempgmail.app.presentation.viewmodel.HistoryFilter
import com.tempgmail.app.presentation.viewmodel.HistoryViewModel
import java.text.DateFormat
import java.util.Date

/**
 * Экран истории адресов: поиск, фильтр по статусу, карточки с действиями,
 * удаление с подтверждением, экспорт в CSV.
 */
@Composable
fun HistoryScreen(viewModel: HistoryViewModel = hiltViewModel()) {
    val ui by viewModel.ui.collectAsState()
    val history by viewModel.history.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    var deleteCandidate by remember { mutableStateOf<TemporaryEmail?>(null) }
    var alsoDeleteFilter by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is HistoryEvent.Message -> snackbar.showSnackbar(
                    event.arg?.let { context.getString(event.textRes, it) }
                        ?: context.getString(event.textRes)
                )
                is HistoryEvent.ShareCsv -> Unit // обрабатывается колбэком exportCsv
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.history_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(8.dp))

            // ---------- Поиск ----------
            OutlinedTextField(
                value = ui.query,
                onValueChange = viewModel::onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(R.string.history_search_hint)) },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true,
            )
            Spacer(Modifier.height(8.dp))

            // ---------- Фильтры статуса + экспорт ----------
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HistoryFilter.entries.forEach { filter ->
                    val label = when (filter) {
                        HistoryFilter.ALL -> R.string.history_filter_all
                        HistoryFilter.ACTIVE -> R.string.history_filter_active
                        HistoryFilter.DISABLED -> R.string.history_filter_disabled
                    }
                    FilterChip(
                        selected = ui.filter == filter,
                        onClick = { viewModel.onFilterChange(filter) },
                        label = { Text(stringResource(label)) },
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = {
                    viewModel.exportCsv { fileName ->
                        // Реальный файл формируется в получателе события; здесь для MVP
                        // просто показываем уведомление об успешном экспорте
                        android.util.Log.i("HistoryScreen", "export: $fileName")
                    }
                }) {
                    Icon(Icons.Default.Share, contentDescription = stringResource(R.string.history_export))
                }
            }
            Spacer(Modifier.height(8.dp))

            // ---------- Список ----------
            if (history.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.history_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(history, key = { it.id }) { email ->
                        HistoryCard(
                            email = email,
                            onCopy = {
                                val cm = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                                    as android.content.ClipboardManager
                                cm.setPrimaryClip(
                                    android.content.ClipData.newPlainText("temp_email", email.fullEmail)
                                )
                            },
                            onToggle = { viewModel.toggleActive(email) },
                            onDelete = {
                                deleteCandidate = email
                                alsoDeleteFilter = email.filterId != null
                            },
                        )
                    }
                    item { Spacer(Modifier.height(80.dp)) }
                }
            }
        }

        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    // ---------- Диалог подтверждения удаления ----------
    deleteCandidate?.let { candidate ->
        AlertDialog(
            onDismissRequest = { deleteCandidate = null },
            title = { Text(stringResource(R.string.history_delete_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.history_delete_message, candidate.fullEmail))
                    if (candidate.filterId != null) {
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = alsoDeleteFilter,
                                onCheckedChange = { alsoDeleteFilter = it },
                            )
                            Text(stringResource(R.string.history_delete_with_filter))
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.delete(candidate, alsoDeleteFilter)
                    deleteCandidate = null
                }) { Text(stringResource(R.string.delete)) }
            },
            dismissButton = {
                TextButton(onClick = { deleteCandidate = null }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

/** Карточка одного временного адреса в списке истории. */
@Composable
private fun HistoryCard(
    email: TemporaryEmail,
    onCopy: () -> Unit,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = email.fullEmail,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (email.isActive) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(
                        R.string.created_at_format,
                        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                            .format(Date(email.createdAt)),
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                email.site?.let {
                    Text("· $it", style = MaterialTheme.typography.labelMedium)
                }
                Text(
                    text = stringResource(
                        if (email.isActive) R.string.status_active else R.string.status_disabled
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (email.isActive) MaterialTheme.colorScheme.tertiary
                    else MaterialTheme.colorScheme.error,
                )
            }

            // Включить / отключить адрес
            Switch(checked = email.isActive, onCheckedChange = { onToggle() })

            IconButton(onClick = onCopy) {
                Icon(Icons.Default.ContentCopy, contentDescription = stringResource(R.string.btn_copy))
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = stringResource(R.string.delete),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}
