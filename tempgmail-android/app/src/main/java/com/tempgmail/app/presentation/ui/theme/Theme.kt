package com.tempgmail.app.presentation.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.tempgmail.app.domain.model.AppTheme

// Фирменные цвета приложения (сид-синий Gmail-подобный)
private val BluePrimary = Color(0xFF1A73E8)
private val BluePrimaryDark = Color(0xFFA8C7FA)
private val BlueSecondary = Color(0xFF00639B)
private val PurpleTertiary = Color(0xFF6750A4)

/** Светлая цветовая схема Material 3 */
private val LightColors = lightColorScheme(
    primary = BluePrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E3FD),
    onPrimaryContainer = Color(0xFF001C38),
    secondary = BlueSecondary,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFCEE5FF),
    onSecondaryContainer = Color(0xFF001D33),
    tertiary = PurpleTertiary,
    onTertiary = Color.White,
    surface = Color(0xFFFDFCFF),
    onSurface = Color(0xFF1A1C1E),
    surfaceVariant = Color(0xFFE0E2EC),
    onSurfaceVariant = Color(0xFF44474E),
    error = Color(0xFFBA1A1A),
)

/** Тёмная цветовая схема Material 3 */
private val DarkColors = darkColorScheme(
    primary = BluePrimaryDark,
    onPrimary = Color(0xFF00315D),
    primaryContainer = Color(0xFF004881),
    onPrimaryContainer = Color(0xFFD3E3FD),
    secondary = Color(0xFF95CCFF),
    onSecondary = Color(0xFF003353),
    secondaryContainer = Color(0xFF004A75),
    onSecondaryContainer = Color(0xFFCEE5FF),
    tertiary = Color(0xFFD0BCFF),
    onTertiary = Color(0xFF381E72),
    surface = Color(0xFF121316),
    onSurface = Color(0xFFE2E2E6),
    surfaceVariant = Color(0xFF44474E),
    onSurfaceVariant = Color(0xFFC4C6D0),
    error = Color(0xFFFFB4AB),
)

/**
 * Главная тема приложения.
 * @param appTheme выбранная тема: светлая/тёмная/системная
 * @param dynamicColors использовать ли Material You динамические цвета (Android 12+)
 */
@Composable
fun TempGmailTheme(
    appTheme: AppTheme = AppTheme.SYSTEM,
    dynamicColors: Boolean = true,
    content: @Composable () -> Unit,
) {
    val dark = when (appTheme) {
        AppTheme.LIGHT -> false
        AppTheme.DARK -> true
        AppTheme.SYSTEM -> isSystemInDarkTheme()
    }
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColors && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkColors
        else -> LightColors
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = TempGmailTypography,
        content = content,
    )
}
